// src/jobs/paymentWorker.js (ESM) — Payment worker scaffold
import { Worker } from 'bullmq';
import { redis } from '../integrations/redis.js';

/**
 * Payment worker - handles payment verification, refund processing
 */
export function createPaymentWorker() {
  const worker = new Worker(
    'paymentQueue',
    async (job) => {
      console.log(`[Worker:payment] Processing job: ${job.name}`, job.data);

      switch (job.name) {
        case 'verify-payment':
          console.log(`[Payment] Verifying payment for booking #${job.data.bookingId}`);
          break;

        case 'process-refund':
          console.log(`[Payment] Processing refund for booking #${job.data.bookingId}`);
          break;

        case 'payment-timeout':
          console.log(`[Payment] Payment timeout for booking #${job.data.bookingId}`);
          break;

        default:
          console.log(`[Worker:payment] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    { connection: redis, concurrency: 3 }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker:payment] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:payment] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Payment worker started');
  return worker;
}
