const Redis = require('ioredis');

let redis = null;
let redisAvailable = false;

function getRedisConnection() {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // required by BullMQ
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('[Redis] Max retries reached, giving up');
          return null;
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      if (redisAvailable) {
        console.error('[Redis] Connection lost:', err.message);
      }
      redisAvailable = false;
    });

    redis.on('connect', () => {
      redisAvailable = true;
      console.log('[Redis] Connected successfully');
    });
  }
  return redis;
}

/**
 * Try to connect Redis. Returns true if successful.
 */
async function tryConnectRedis() {
  try {
    const conn = getRedisConnection();
    await conn.connect();
    redisAvailable = true;
    return true;
  } catch (err) {
    console.warn('[Redis] Not available:', err.message);
    redisAvailable = false;
    return false;
  }
}

function isRedisAvailable() {
  return redisAvailable;
}

function closeRedis() {
  if (redis) {
    try {
      redis.disconnect();
    } catch (err) {
      console.warn('[Redis] Error during disconnect:', err.message);
    }
    redis = null;
    redisAvailable = false;
  }
}

module.exports = { getRedisConnection, tryConnectRedis, isRedisAvailable, closeRedis };
