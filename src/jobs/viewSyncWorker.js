// src/jobs/viewSyncWorker.js (ESM) — flush Redis post-view counters into the DB
// Every 5 minutes, drains `post:views:<id>` counters and adds them to
// posts.view_count. See postService.flushViewCounters().
import { Worker } from 'bullmq';
import { bullConnection } from '../integrations/redis.js';
import { postService } from '../api/v1/posts/post.service.js';

export async function processFlushPostViews() {
  console.log(`[Worker:flush-post-views] Running at ${new Date().toISOString()}`);
  const result = await postService.flushViewCounters();
  console.log(`[Worker:flush-post-views] Flushed ${result.flushed} post(s)`);
  return result;
}

export function createViewSyncWorker() {
  const worker = new Worker(
    'bookingQueue',
    async (job) => {
      if (job.name === 'flush-post-views-job') return processFlushPostViews(job);
    },
    { connection: bullConnection, concurrency: 1 }
  );
  worker.on('failed', (job, err) => {
    if (job?.name === 'flush-post-views-job') console.error('[Worker:flush-post-views] Failed:', err.message);
  });
  console.log('[Worker] View-sync worker started');
  return worker;
}
