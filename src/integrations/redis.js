// src/integrations/redis.js — ioredis client singleton
import Redis from 'ioredis';
import { env } from '../config/env.js';
import logger from '../config/logger.js';

const globalForRedis = globalThis;

/**
 * Singleton ioredis client.
 * Uses ENV REDIS_URL (e.g. redis://localhost:6379).
 * Lazy-connect so the app can boot even if Redis is briefly unavailable.
 */
function createClient() {
  if (!env.REDIS_URL) {
    logger.warn('⚠️  REDIS_URL is empty — Redis features (OTP, login lock, RT whitelist) will fail.');
  }

  const client = new Redis(env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  client.on('connect', () => logger.info('✓ Redis connected'));
  client.on('error', (err) => logger.error(`Redis error: ${err.message}`));

  return client;
}

export const redis = globalForRedis.__redis || createClient();
if (env.NODE_ENV !== 'production') globalForRedis.__redis = redis;

export default redis;
