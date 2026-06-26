// src/jobs/worker.js (ESM) — Standalone worker process
// Run with: node src/jobs/worker.js
//
// Also exports startWorkers() for use in server.js (inline workers mode)
import 'dotenv/config';
import prisma from '../config/db.js';
import { createReleaseHoldWorker } from './releaseHoldWorker.js';
import { createNotificationWorker } from './notificationWorker.js';
import { createPaymentWorker } from './paymentWorker.js';
import { scheduleReleaseHoldCron } from './queue.js';

export async function startWorkers() {
  console.log('[Workers] Starting BullMQ workers...');

  // Verify DB connection (Prisma)
  await prisma.$queryRaw`SELECT 1`;
  console.log('[Workers] DB connection OK');

  // Start workers
  const releaseHoldWorker = createReleaseHoldWorker();
  const notificationWorker = createNotificationWorker();
  const paymentWorker = createPaymentWorker();

  // Schedule cron jobs
  await scheduleReleaseHoldCron();

  console.log('[Workers] All workers started');

  // Graceful shutdown handler (only used when running standalone)
  const shutdown = async (signal) => {
    console.log(`\n[Workers] Received ${signal}, shutting down gracefully...`);
    await releaseHoldWorker.close();
    await notificationWorker.close();
    await paymentWorker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// If run directly as standalone worker process
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startWorkers().catch((err) => {
    console.error('[Workers] Failed to start:', err);
    process.exit(1);
  });
}
