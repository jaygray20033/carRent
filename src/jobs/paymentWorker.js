const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');

/**
 * Payment worker - scaffold for future implementation
 * Will handle: payment verification, refund processing
 */
function createPaymentWorker() {
  const worker = new Worker(
    'paymentQueue',
    async (job) => {
      console.log(`[Worker:payment] Processing job: ${job.name}`, job.data);

      switch (job.name) {
        case 'verify-payment':
          // TODO: Verify payment with payment gateway
          console.log(`[Payment] Verifying payment for booking #${job.data.bookingId}`);
          break;

        case 'process-refund':
          // TODO: Process refund
          console.log(`[Payment] Processing refund for booking #${job.data.bookingId}`);
          break;

        case 'payment-timeout':
          // TODO: Handle payment timeout
          console.log(`[Payment] Payment timeout for booking #${job.data.bookingId}`);
          break;

        default:
          console.log(`[Worker:payment] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    {
      connection: getRedisConnection(),
      concurrency: 3,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker:payment] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:payment] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Payment worker started');
  return worker;
}

module.exports = { createPaymentWorker };
