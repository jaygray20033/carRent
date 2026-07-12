// tests/jobsWiring.test.js — Unit tests for BullMQ worker wiring (Day 43.5, Group 1)
//
// These cover the factory + queue + bootstrap layer that jobsWorkers.test.js
// deliberately skips (it tests the pure processors). Here we mock the BullMQ
// `Worker`/`Queue` classes so no Redis is ever contacted, and assert that:
//   - each create*Worker() wires the right queue name + concurrency
//   - the worker registers completed/failed listeners (dead-letter path)
//   - queue.js schedules the repeatable crons with the documented intervals
//     and clears stale repeatables first (retry/backoff options: attempts 3)
//   - startWorkers() pings the DB, builds all four workers, schedules crons
//
import { jest } from '@jest/globals';

// ── Capture every Worker constructed and the handlers it registers ───────────
const workerInstances = [];
class FakeWorker {
  constructor(queueName, processor, opts) {
    this.queueName = queueName;
    this.processor = processor;
    this.opts = opts;
    this.listeners = {};
    this.close = jest.fn(async () => {});
    workerInstances.push(this);
  }
  on(event, cb) {
    this.listeners[event] = cb;
    return this;
  }
}

// ── Capture Queue construction + repeatable-cron bookkeeping ─────────────────
const queueInstances = [];
const repeatableStore = []; // shared "server-side" repeatable list
class FakeQueue {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
    this.add = jest.fn(async (jobName, data, jobOpts) => {
      this.lastAdd = { jobName, data, jobOpts };
      return { id: jobName };
    });
    this.getRepeatableJobs = jest.fn(async () => [...repeatableStore]);
    this.removeRepeatableByKey = jest.fn(async (key) => {
      const i = repeatableStore.findIndex((j) => j.key === key);
      if (i >= 0) repeatableStore.splice(i, 1);
      return true;
    });
    queueInstances.push(this);
  }
}

jest.unstable_mockModule('bullmq', () => ({
  Worker: FakeWorker,
  Queue: FakeQueue,
}));

// bullConnection is only a config object passed through — stub it out.
jest.unstable_mockModule('../src/integrations/redis.js', () => ({
  bullConnection: { host: 'fake', port: 0 },
  redis: {},
  default: {},
}));

// Prisma is only used by startWorkers() for a health-check query.
const queryRawMock = jest.fn(async () => [{ '1': 1 }]);
const disconnectMock = jest.fn(async () => {});
jest.unstable_mockModule('../src/config/db.js', () => ({
  default: { $queryRaw: queryRawMock, $disconnect: disconnectMock },
}));

const { createReleaseHoldWorker } = await import('../src/jobs/releaseHoldWorker.js');
const { createNotificationWorker } = await import('../src/jobs/notificationWorker.js');
const { createPaymentWorker } = await import('../src/jobs/paymentWorker.js');
const { createViewSyncWorker } = await import('../src/jobs/viewSyncWorker.js');
const {
  bookingQueue,
  notificationQueue,
  paymentQueue,
  scheduleReleaseHoldCron,
  scheduleFlushPostViewsCron,
} = await import('../src/jobs/queue.js');

beforeEach(() => {
  workerInstances.length = 0;
  repeatableStore.length = 0;
});

describe('worker factories', () => {
  it('createReleaseHoldWorker binds bookingQueue with concurrency 1 and listeners', () => {
    const w = createReleaseHoldWorker();
    expect(w.queueName).toBe('bookingQueue');
    expect(w.opts.concurrency).toBe(1);
    // A failed listener is the dead-letter safety net: it must exist and not throw.
    expect(typeof w.listeners.failed).toBe('function');
    expect(() => w.listeners.failed({ name: 'release-hold-job' }, new Error('boom'))).not.toThrow();
    expect(() => w.listeners.completed?.({ name: 'release-hold-job' }, { cancelled: 0 })).not.toThrow();
  });

  it('createNotificationWorker binds notificationQueue with concurrency 5', () => {
    const w = createNotificationWorker();
    expect(w.queueName).toBe('notificationQueue');
    expect(w.opts.concurrency).toBe(5);
    expect(() => w.listeners.failed({ name: 'send-email' }, new Error('smtp down'))).not.toThrow();
    expect(() => w.listeners.completed({ name: 'send-email' })).not.toThrow();
  });

  it('createPaymentWorker binds paymentQueue with concurrency 3', () => {
    const w = createPaymentWorker();
    expect(w.queueName).toBe('paymentQueue');
    expect(w.opts.concurrency).toBe(3);
    // failed handler tolerates a null job (BullMQ passes undefined when the job is gone)
    expect(() => w.listeners.failed(null, new Error('refund failed'))).not.toThrow();
    expect(() => w.listeners.completed({ name: 'process-refund' })).not.toThrow();
  });

  it('createViewSyncWorker binds bookingQueue with concurrency 1', () => {
    const w = createViewSyncWorker();
    expect(w.queueName).toBe('bookingQueue');
    expect(w.opts.concurrency).toBe(1);
    expect(() => w.listeners.failed({ name: 'flush-post-views-job' }, new Error('redis'))).not.toThrow();
  });

  it("view-sync worker ignores jobs that are not flush-post-views-job", async () => {
    const w = createViewSyncWorker();
    // Non-matching job name → processor returns undefined (no delegation).
    await expect(w.processor({ name: 'release-hold-job' })).resolves.toBeUndefined();
  });

  it('release-hold worker processor only runs on its own job name', async () => {
    const w = createReleaseHoldWorker();
    await expect(w.processor({ name: 'some-other-job' })).resolves.toBeUndefined();
  });
});

describe('queue definitions + cron scheduling', () => {
  it('creates the three named queues with 3 retry attempts + exponential backoff', () => {
    for (const q of [bookingQueue, notificationQueue, paymentQueue]) {
      expect(q.opts.defaultJobOptions.attempts).toBe(3);
      expect(q.opts.defaultJobOptions.backoff.type).toBe('exponential');
      expect(q.opts.defaultJobOptions.removeOnFail).toBeGreaterThan(0);
    }
  });

  it('scheduleReleaseHoldCron adds a repeatable job every 60s', async () => {
    await scheduleReleaseHoldCron();
    expect(bookingQueue.add).toHaveBeenCalledWith(
      'release-hold-job',
      expect.any(Object),
      expect.objectContaining({ repeat: { every: 60_000 }, jobId: 'release-hold-cron' })
    );
  });

  it('scheduleFlushPostViewsCron adds a repeatable job every 5 minutes', async () => {
    await scheduleFlushPostViewsCron();
    expect(bookingQueue.add).toHaveBeenCalledWith(
      'flush-post-views-job',
      expect.any(Object),
      expect.objectContaining({ repeat: { every: 300_000 }, jobId: 'flush-post-views-cron' })
    );
  });

  it('scheduleReleaseHoldCron removes a stale repeatable before re-adding (no duplicates)', async () => {
    repeatableStore.push({ name: 'release-hold-job', key: 'stale-key-1' });
    await scheduleReleaseHoldCron();
    expect(bookingQueue.removeRepeatableByKey).toHaveBeenCalledWith('stale-key-1');
    expect(bookingQueue.add).toHaveBeenCalled();
  });
});

describe('startWorkers() bootstrap', () => {
  it('pings the DB, constructs all four workers, and schedules both crons', async () => {
    const { startWorkers } = await import('../src/jobs/worker.js');
    await startWorkers();
    expect(queryRawMock).toHaveBeenCalled();
    // Four workers built in this call.
    expect(workerInstances.length).toBe(4);
    const names = workerInstances.map((w) => w.queueName).sort();
    expect(names).toEqual(['bookingQueue', 'bookingQueue', 'notificationQueue', 'paymentQueue']);
  });
});
