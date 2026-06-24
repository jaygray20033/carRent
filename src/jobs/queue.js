const { Queue } = require('bullmq');
const { getRedisConnection } = require('../config/redis');

const connection = getRedisConnection();

// 3 queues as specified
const bookingQueue = new Queue('bookingQueue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

const notificationQueue = new Queue('notificationQueue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

const paymentQueue = new Queue('paymentQueue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

/**
 * Schedule the repeating release-hold cron job
 * Runs every 1 minute
 */
async function scheduleReleaseHoldCron() {
  // Remove existing repeatable jobs to avoid duplicates
  const existingJobs = await bookingQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === 'release-hold-job') {
      await bookingQueue.removeRepeatableByKey(job.key);
    }
  }

  // Add new repeatable job - every 1 minute
  await bookingQueue.add(
    'release-hold-job',
    { type: 'release-hold-scan' },
    {
      repeat: {
        every: 60 * 1000, // 1 minute in ms
      },
      jobId: 'release-hold-cron',
    }
  );

  console.log('[Queue] Scheduled release-hold-job cron (every 1 minute)');
}

module.exports = {
  bookingQueue,
  notificationQueue,
  paymentQueue,
  scheduleReleaseHoldCron,
};
