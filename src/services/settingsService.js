// src/services/settingsService.js
// Day 35 (UC-60) — site settings read/write with a Redis cache.
//
// Settings are simple key/value rows in the SiteSetting table, grouped by `grp`
// (contact | pricing | notifications | storage | social | general). The whole
// set is cached under a single key (`cache:settings`) and invalidated on write.
//
// The pricing group is the source of truth for values that used to be hardcoded
// (tax_rate, deposit_default, dropoff_penalty, and the derived rate ratios):
// getPricingConfig() reads them from here so business code stops hardcoding.
import prisma from '../config/db.js';
import { redis } from '../integrations/redis.js';
import logger from '../config/logger.js';

const CACHE_KEY = 'cache:settings';
const CACHE_TTL = 3600; // 1 hour — invalidated explicitly on PUT

// Pricing defaults used when a key is missing from the DB. These mirror the
// values previously hardcoded in booking/car pricing code.
export const PRICING_DEFAULTS = {
  tax_rate: 10, // percent
  deposit_default: 5_000_000, // VND
  dropoff_penalty: 200_000, // VND, applied when dropoff ≠ pickup
  hourly_rate_ratio: 0.18, // hourly rate = daily × ratio
  with_driver_surcharge: 0.4, // with-driver daily = daily × (1 + surcharge)
};

// Human-friendly labels + group for pricing keys, used when a PUT creates a row
// that didn't exist in the seed yet.
const KEY_META = {
  tax_rate: { grp: 'pricing', label: 'Thuế suất (%)' },
  deposit_default: { grp: 'pricing', label: 'Đặt cọc mặc định (VND)' },
  dropoff_penalty: { grp: 'pricing', label: 'Phụ phí trả khác điểm (VND)' },
  hourly_rate_ratio: { grp: 'pricing', label: 'Hệ số giá theo giờ' },
  with_driver_surcharge: { grp: 'pricing', label: 'Phụ phí tài xế' },
};

/** Read every setting row and shape it as { key: { value, grp, label } }. */
const loadAll = async () => {
  const rows = await prisma.siteSetting.findMany({ orderBy: { key: 'asc' } });
  const map = {};
  for (const r of rows) {
    map[r.key] = { value: r.value, grp: r.grp ?? null, label: r.label ?? null };
  }
  return map;
};

export const settingsService = {
  /** All settings, read-through Redis cache. Returns { key: {value, grp, label} }. */
  async getAll() {
    try {
      const raw = await redis.get(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      logger.warn(`settings cacheGet failed: ${err.message}`);
    }
    const map = await loadAll();
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(map));
    } catch (err) {
      logger.warn(`settings cacheSet failed: ${err.message}`);
    }
    return map;
  },

  /** Flat { key: value } view (values only), grouped nowhere. */
  async getMap() {
    const all = await this.getAll();
    const flat = {};
    for (const [k, v] of Object.entries(all)) flat[k] = v.value;
    return flat;
  },

  /**
   * Upsert a batch of key/value pairs, then invalidate the cache.
   * @param {Record<string,string|number>} updates
   * @returns the fresh, full settings map
   */
  async updateMany(updates) {
    const entries = Object.entries(updates);
    await prisma.$transaction(
      entries.map(([key, value]) => {
        const meta = KEY_META[key] ?? {};
        const str = value === null || value === undefined ? null : String(value);
        return prisma.siteSetting.upsert({
          where: { key },
          update: { value: str },
          create: { key, value: str, grp: meta.grp ?? null, label: meta.label ?? null },
        });
      })
    );
    await this.invalidate();
    return this.getAll();
  },

  /** Drop the settings cache (called on write). Best-effort. */
  async invalidate() {
    try {
      await redis.del(CACHE_KEY);
    } catch (err) {
      logger.warn(`settings cache invalidate failed: ${err.message}`);
    }
  },

  /**
   * Pricing config read from settings, with numeric coercion + defaults. This is
   * what pricing code should call instead of hardcoding constants.
   */
  async getPricingConfig() {
    const map = await this.getMap();
    const num = (key) => {
      const v = Number(map[key]);
      return Number.isFinite(v) ? v : PRICING_DEFAULTS[key];
    };
    return {
      taxRate: num('tax_rate'),
      depositDefault: num('deposit_default'),
      dropoffPenalty: num('dropoff_penalty'),
      hourlyRateRatio: num('hourly_rate_ratio'),
      withDriverSurcharge: num('with_driver_surcharge'),
    };
  },
};

export default settingsService;
