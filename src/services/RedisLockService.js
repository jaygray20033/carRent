const { getRedisConnection, isRedisAvailable } = require('../config/redis');
const { REDIS_KEY } = require('../config/constants');

class RedisLockService {
  get redis() {
    return getRedisConnection();
  }

  /**
   * Create a hold lock for a car in a date range
   * Key: booking:hold:{carId}:{startDate}:{endDate}
   * Value: bookingId
   */
  async acquireHold(carId, startDate, endDate, bookingId, ttlSeconds) {
    if (!isRedisAvailable()) {
      console.warn('[RedisLock] Redis not available, skipping acquireHold');
      return true; // graceful degradation
    }
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const result = await this.redis.set(key, bookingId.toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Extend TTL of an existing hold
   */
  async extendHold(carId, startDate, endDate, bookingId, ttlSeconds) {
    if (!isRedisAvailable()) {
      console.warn('[RedisLock] Redis not available, skipping extendHold');
      return true;
    }
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const currentHolder = await this.redis.get(key);
    if (currentHolder && currentHolder === bookingId.toString()) {
      await this.redis.expire(key, ttlSeconds);
      return true;
    }
    return false;
  }

  /**
   * Release hold lock
   */
  async releaseHold(carId, startDate, endDate, bookingId) {
    if (!isRedisAvailable()) {
      console.warn('[RedisLock] Redis not available, skipping releaseHold');
      return true;
    }
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const currentHolder = await this.redis.get(key);
    if (currentHolder && currentHolder === bookingId.toString()) {
      await this.redis.del(key);
      return true;
    }
    return false;
  }

  /**
   * Check if a hold exists for a car date range
   */
  async checkHold(carId, startDate, endDate) {
    if (!isRedisAvailable()) return null;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const holder = await this.redis.get(key);
    return holder ? parseInt(holder, 10) : null;
  }

  /**
   * Get TTL of a hold
   */
  async getHoldTTL(carId, startDate, endDate) {
    if (!isRedisAvailable()) return -1;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    return this.redis.ttl(key);
  }
}

module.exports = new RedisLockService();
