// tests/bookingLock.test.js — Redis hold-lock concurrency (UC-14 race safety)
//
// Goal (Day 15): 100 concurrent acquireHold calls on the SAME slot → exactly 1
// winner. This proves the SET NX guard prevents double-booking under a race.
//
// Setup notes:
//  - ioredis is mapped to an in-memory fake with NX support (jest.config
//    moduleNameMapper → tests/__mocks__/ioredis.js).
//  - tests/setup.js empties REDIS_URL (noop mode); we MUST set it before importing
//    so RedisLockService treats Redis as live and actually runs the NX guard.
//  - No database is touched here — this is a pure lock unit/concurrency test.
//
process.env.REDIS_URL = 'redis://localhost:6379';

const { default: RedisLockService } = await import('../src/services/RedisLockService.js');

const CAR_ID = 4242;
const START = '2026-07-01T10:00:00.000Z';
const END = '2026-07-03T10:00:00.000Z';
const TTL = 900;

describe('RedisLockService — hold concurrency (UC-14)', () => {
  it('100 parallel acquireHold on the same slot → exactly 1 winner', async () => {
    const attempts = Array.from({ length: 100 }, (_, i) =>
      RedisLockService.acquireHold(CAR_ID, START, END, i + 1, TTL)
    );
    const results = await Promise.all(attempts);

    const winners = results.filter((ok) => ok === true);
    expect(winners).toHaveLength(1);
  });

  it('the slot is freed after release, then a new holder can acquire it', async () => {
    // The winning booking id from the run above held the slot; release as that id.
    const holder = await RedisLockService.checkHold(CAR_ID, START, END);
    expect(holder).not.toBeNull();

    const released = await RedisLockService.releaseHold(CAR_ID, START, END, holder);
    expect(released).toBe(true);

    const acquiredAgain = await RedisLockService.acquireHold(CAR_ID, START, END, 9999, TTL);
    expect(acquiredAgain).toBe(true);
  });

  it('a different slot is independent and can be held concurrently', async () => {
    const ok = await RedisLockService.acquireHold(CAR_ID, START, '2026-07-05T10:00:00.000Z', 1, TTL);
    expect(ok).toBe(true);
  });
});
