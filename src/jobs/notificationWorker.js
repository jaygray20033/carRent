const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');

/**
 * Notification worker - scaffold for future implementation
 * Will handle: email, push, SMS notifications
 */
function createNotificationWorker() {
  const worker = new Worker(
    'notificationQueue',
    async (job) => {
      console.log(`[Worker:notification] Processing job: ${job.name}`, job.data);

      switch (job.name) {
        case 'booking-confirmed':
          // TODO: Send confirmation email to renter
          console.log(`[Notification] Booking confirmed - send email to renter`);
          break;

        case 'booking-cancelled':
          // TODO: Send cancellation notice
          console.log(`[Notification] Booking cancelled - send notice`);
          break;

        case 'payment-reminder':
          // TODO: Send payment reminder before hold expires
          console.log(`[Notification] Payment reminder sent`);
          break;

        default:
          console.log(`[Worker:notification] Unknown job type: ${job.name}`);
      }

      return { processed: true };
    },
    {
      connection: getRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker:notification] Job ${job.name} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker:notification] Job ${job?.name} failed:`, err.message);
  });

  console.log('[Worker] Notification worker started');
  return worker;
}

module.exports = { createNotificationWorker };
