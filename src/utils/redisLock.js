// ─────────────────────────────────────────────────────────────────────
//  src/utils/redisLock.js — Distributed lock via Redis SETNX (UC-14)
//  Fallback: in-memory Map when Redis is not available
// ─────────────────────────────────────────────────────────────────────
import redis from '../config/redis.js';

const DEFAULT_TTL = 15 * 60; // 15 minutes in seconds

// In-memory fallback store: key → { expireAt: timestamp }
const memoryLocks = new Map();

/**
 * Acquire a lock on a key.
 * @param {string} key - Lock key (e.g. "lock:car:123")
 * @param {number} ttlSeconds - TTL in seconds (default 15 min)
 * @returns {Promise<boolean>} true if lock acquired, false if already held
 */
export async function acquireLock(key, ttlSeconds = DEFAULT_TTL) {
  if (redis) {
    // Redis SETNX with EX (atomic)
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  // In-memory fallback
  const existing = memoryLocks.get(key);
  if (existing && existing.expireAt > Date.now()) {
    return false; // lock held
  }
  memoryLocks.set(key, { expireAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

/**
 * Release a lock.
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function releaseLock(key) {
  if (redis) {
    await redis.del(key);
  } else {
    memoryLocks.delete(key);
  }
}

/**
 * Check if a lock is held.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function isLocked(key) {
  if (redis) {
    const val = await redis.get(key);
    return val !== null;
  }
  const existing = memoryLocks.get(key);
  if (existing && existing.expireAt > Date.now()) {
    return true;
  }
  memoryLocks.delete(key);
  return false;
}

export default { acquireLock, releaseLock, isLocked };
