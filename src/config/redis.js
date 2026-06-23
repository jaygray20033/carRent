// ─────────────────────────────────────────────────────────────────────
//  src/config/redis.js — Redis client (optional, fallback to in-memory)
// ─────────────────────────────────────────────────────────────────────
import Redis from 'ioredis';
import env from './env.js';

let redis = null;

if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 3) return null; // stop retrying
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', (err) => {
    console.warn('[Redis] Connection error:', err.message);
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected');
  });
} else {
  console.warn('[Redis] REDIS_URL not set — using in-memory lock fallback');
}

export default redis;
