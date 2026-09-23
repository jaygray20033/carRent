// src/utils/redisLock.js — Distributed lock via Redis SETNX (ESM)
import { redis } from '../integrations/redis.js';

const DEFAULT_TTL = 15 * 60;
const memoryLocks = new Map();

export async function acquireLock(key, ttlSeconds = DEFAULT_TTL) {
  if (redis && redis.status !== 'noop') {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
  const existing = memoryLocks.get(key);
  if (existing && existing.expireAt > Date.now()) return false;
  memoryLocks.set(key, { expireAt: Date.now() + ttlSeconds * 1000 });
  return true;
}

export async function releaseLock(key) {
  if (redis && redis.status !== 'noop') { await redis.del(key); } else { memoryLocks.delete(key); }
}

export async function isLocked(key) {
  if (redis && redis.status !== 'noop') { return (await redis.get(key)) !== null; }
  const existing = memoryLocks.get(key);
  if (existing && existing.expireAt > Date.now()) return true;
  memoryLocks.delete(key);
  return false;
}

export default { acquireLock, releaseLock, isLocked };
