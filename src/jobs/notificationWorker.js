// src/jobs/notificationWorker.js (ESM) — Notification worker scaffold
import { Worker } from 'bullmq';
import { bullConnection } from '../integrations/redis.js';

/**
 * Notification worker - handles email, push, SMS notifications
 */
export function createNotificationWorker() {
  const worker = new Worker(
    'notificationQueue',
    async (job) => {
      console.log(`[Worker:notification] Processing job: ${job.name}`, job.data);

      switch (job.name) {
        case 'booking-confirmed': {
          const channels = job.data.channels || ['email'];
          console.log(
            `[Notification] Booking #${job.data.bookingId} confirmed — notify user #${job.data.userId} via ${channels.join(', ')}`
          );
          // Day 18: send real email (Mailhog/SendGrid) + SMS here.
          break;
        }

        case 'booking-cancelled':
          console.log(`[Notification] Booking cancelled - send notice`);
          break;

        case 'payment-reminder':
          console.log(`[Notification] Payment reminder sent`);
          break;

        default:
          console.log(`[Worker:notification] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    { connection: bullConnection, concurrency: 5 }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker:notification] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:notification] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Notification worker started');
  return worker;
}
