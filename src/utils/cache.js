// src/utils/cache.js — small helper around the (optional) Redis client
// Falls back to a noop stub automatically when REDIS_URL is empty,
// so caching is a transparent no-op in local dev without Redis.
import { redis } from '../integrations/redis.js';
import logger from '../config/logger.js';

/**
 * Build a stable cache key from a prefix + a query object.
 * Keys are sorted so {a:1,b:2} and {b:2,a:1} map to the same key.
 */
export const buildCacheKey = (prefix, query = {}) => {
  const entries = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${prefix}:${entries.join('&') || 'all'}`;
};

/**
 * Get a JSON value from cache. Returns null on miss or any error.
 */
export const cacheGet = async (key) => {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn(`cacheGet failed for ${key}: ${err.message}`);
    return null;
  }
};

/**
 * Store a JSON value in cache with a TTL (seconds). Best-effort, never throws.
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds default 300 (5 minutes)
 */
export const cacheSet = async (key, value, ttlSeconds = 300) => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn(`cacheSet failed for ${key}: ${err.message}`);
  }
};

/**
 * Wrap a producer fn with read-through caching.
 */
export const cached = async (key, ttlSeconds, producer) => {
  const hit = await cacheGet(key);
  if (hit !== null) return { data: hit, cached: true };
  const data = await producer();
  await cacheSet(key, data, ttlSeconds);
  return { data, cached: false };
};

export default { buildCacheKey, cacheGet, cacheSet, cached };
