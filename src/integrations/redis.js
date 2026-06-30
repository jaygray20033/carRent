// src/integrations/redis.js — ioredis client singleton
import Redis from 'ioredis';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

const globalForRedis = globalThis;

/**
 * Singleton ioredis client.
 * If REDIS_URL is empty, returns a noop stub so the app can run without Redis.
 */
function createClient() {
  if (!env.REDIS_URL) {
    logger.warn('⚠️  REDIS_URL is empty — using noop Redis stub.');
    return {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 0,
      setex: async () => 'OK',
      incr: async () => 1,
      getdel: async () => null,
      scan: async () => ['0', []],
      expire: async () => 1,
      ttl: async () => -1,
      exists: async () => 0,
      on: () => {},
      quit: async () => {},
      status: 'noop',
    };
  }

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying after 3 attempts
      return Math.min(times * 200, 2000);
    },
  });

  client.on('connect', () => logger.info('✓ Redis connected'));
  client.on('error', (err) => logger.error(`Redis error: ${err.message}`));

  return client;
}

export const redis = globalForRedis.__redis || createClient();
if (env.NODE_ENV !== 'production') globalForRedis.__redis = redis;

/**
 * Dedicated connection for BullMQ.
 *
 * BullMQ uses blocking commands (BRPOPLPUSH etc.) and requires
 * `maxRetriesPerRequest: null` on its connection — a constraint that does not
 * suit the shared client used for cache/locks. When REDIS_URL is empty we reuse
 * the noop stub so workers degrade gracefully.
 */
function createBullConnection() {
  if (!env.REDIS_URL) return redis; // noop stub — workers won't actually run
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const bullConnection = globalForRedis.__bullRedis || createBullConnection();
if (env.NODE_ENV !== 'production') globalForRedis.__bullRedis = bullConnection;

export default redis;
