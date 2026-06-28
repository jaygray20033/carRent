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

export default redis;
