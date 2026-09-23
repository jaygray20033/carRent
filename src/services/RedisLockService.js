// src/services/RedisLockService.js (ESM)
import { redis } from '../integrations/redis.js';
import { REDIS_KEY } from '../config/constants.js';

class RedisLockService {
  get redis() { return redis; }

  _isAvailable() { return redis && redis.status !== 'noop'; }

  async acquireHold(carId, startDate, endDate, bookingId, ttlSeconds) {
    if (!this._isAvailable()) return true;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const result = await this.redis.set(key, bookingId.toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async extendHold(carId, startDate, endDate, bookingId, ttlSeconds) {
    if (!this._isAvailable()) return true;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const currentHolder = await this.redis.get(key);
    if (currentHolder && currentHolder === bookingId.toString()) {
      await this.redis.expire(key, ttlSeconds);
      return true;
    }
    return false;
  }

  async releaseHold(carId, startDate, endDate, bookingId) {
    if (!this._isAvailable()) return true;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const currentHolder = await this.redis.get(key);
    if (currentHolder && currentHolder === bookingId.toString()) {
      await this.redis.del(key);
      return true;
    }
    return false;
  }

  async checkHold(carId, startDate, endDate) {
    if (!this._isAvailable()) return null;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    const holder = await this.redis.get(key);
    return holder ? parseInt(holder, 10) : null;
  }

  async getHoldTTL(carId, startDate, endDate) {
    if (!this._isAvailable()) return -1;
    const key = `${REDIS_KEY.BOOKING_HOLD}${carId}:${startDate}:${endDate}`;
    return this.redis.ttl(key);
  }
}

export default new RedisLockService();
