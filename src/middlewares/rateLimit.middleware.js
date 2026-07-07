// src/middlewares/rateLimit.middleware.js
// Lightweight Redis-backed fixed-window rate limiter. Degrades to no-op when
// Redis is the noop stub (REDIS_URL empty) — see integrations/redis.js.
import { redis } from '../integrations/redis.js';
import logger from '../config/logger.js';
import { TooManyRequestsError } from '../utils/apiError.js';

/**
 * @param {object} opts
 * @param {number} opts.max      - max requests allowed per window
 * @param {number} opts.windowSec - window length in seconds
 * @param {string} opts.keyPrefix - namespace for the counter key
 * @param {string} [opts.message] - error message on limit hit
 */
export const rateLimit = ({ max, windowSec, keyPrefix, message }) => async (req, _res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `ratelimit:${keyPrefix}:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
    if (count > max) {
      return next(
        new TooManyRequestsError(message || 'Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau.')
      );
    }
    next();
  } catch (err) {
    // Never block a request because the limiter itself failed.
    logger.warn(`rateLimit failed (${keyPrefix}): ${err.message}`);
    next();
  }
};

export default rateLimit;
