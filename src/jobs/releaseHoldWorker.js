// src/jobs/releaseHoldWorker.js (ESM) — Prisma-based release-hold worker
import { Worker } from 'bullmq';
import { redis } from '../integrations/redis.js';
import prisma from '../config/db.js';
import { BOOKING_STATUS } from '../config/constants.js';
import RedisLockService from '../services/RedisLockService.js';

async function processReleaseHold(job) {
  console.log(`[Worker:release-hold] Running scan at ${new Date().toISOString()}`);
  const now = new Date();
  const expiredBookings = await prisma.booking.findMany({
    where: { status: { in: [BOOKING_STATUS.DRAFT, BOOKING_STATUS.PENDING_PAYMENT] }, holdUntil: { lt: now } },
  });
  if (!expiredBookings.length) { console.log('[Worker:release-hold] No expired bookings'); return { cancelled: 0 }; }
  console.log(`[Worker:release-hold] Found ${expiredBookings.length} expired bookings`);
  let cancelledCount = 0;
  for (const booking of expiredBookings) {
    try {
      const prev = booking.status;
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({ where: { id: booking.id }, data: { status: BOOKING_STATUS.CANCELLED, cancelReason: `Auto-cancelled: ${prev} hold expired` } });
        await tx.bookingHistory.create({ data: { bookingId: booking.id, fromStatus: prev, toStatus: BOOKING_STATUS.CANCELLED, note: `Auto-cancelled: ${prev} hold expired`, metadata: JSON.stringify({ holdUntil: booking.holdUntil, auto: true }) } });
      });
      try { await RedisLockService.releaseHold(booking.vehicleId, booking.pickupAt, booking.returnAt, booking.id); } catch { /* best-effort: hold may already be gone */ }
      cancelledCount++;
      console.log(`[Worker:release-hold] Cancelled booking #${booking.id} (${booking.bookingCode})`);
    } catch (err) { console.error(`[Worker:release-hold] Failed #${booking.id}:`, err.message); }
  }
  return { cancelled: cancelledCount, total: expiredBookings.length };
}

export function createReleaseHoldWorker() {
  const worker = new Worker('bookingQueue', async (job) => { if (job.name === 'release-hold-job') return processReleaseHold(job); }, { connection: redis, concurrency: 1 });
  worker.on('completed', (job, result) => { if (job.name === 'release-hold-job') console.log('[Worker:release-hold] Done:', result); });
  worker.on('failed', (job, err) => { console.error(`[Worker:bookingQueue] Failed:`, err.message); });
  console.log('[Worker] Release-hold worker started');
  return worker;
}
