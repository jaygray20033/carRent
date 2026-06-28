// src/jobs/queue.js (ESM) — BullMQ queues using a dedicated Redis connection
import { Queue } from 'bullmq';
import { bullConnection } from '../integrations/redis.js';

const defaultOpts = { removeOnComplete: 100, removeOnFail: 200, attempts: 3, backoff: { type: 'exponential', delay: 2000 } };

export const bookingQueue = new Queue('bookingQueue', { connection: bullConnection, defaultJobOptions: defaultOpts });
export const notificationQueue = new Queue('notificationQueue', { connection: bullConnection, defaultJobOptions: defaultOpts });
export const paymentQueue = new Queue('paymentQueue', { connection: bullConnection, defaultJobOptions: defaultOpts });

export async function scheduleReleaseHoldCron() {
  const existing = await bookingQueue.getRepeatableJobs();
  for (const job of existing) { if (job.name === 'release-hold-job') await bookingQueue.removeRepeatableByKey(job.key); }
  await bookingQueue.add('release-hold-job', { type: 'release-hold-scan' }, { repeat: { every: 60_000 }, jobId: 'release-hold-cron' });
  console.log('[Queue] Scheduled release-hold-job cron (every 1 minute)');
}
