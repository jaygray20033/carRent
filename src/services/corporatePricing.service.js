// B2B Day 3 — Corporate contract pricing (AssetHub table).
// Integer VND math only (no float drift).
import { DEFAULT_CORPORATE_PRICE_CONFIG } from '../constants/corporatePricing.js';
import { UnprocessableError } from '../utils/apiError.js';

export const VEHICLE_TYPES = ['4_5_seat', '7_seat', '16_seat', '29_seat'];
export const RENTAL_TYPES = ['half_day', 'full_day'];

/**
 * Resolve price-config key from rental type + estimated km.
 * AssetHub tiers:
 *   half_day: 0–100 | 100–150
 *   full_day: 100–150 (also used for ≤150) | 150–200
 */
export function resolvePriceKey(rentalType, estimatedKm) {
  const km = Number(estimatedKm);
  if (rentalType === 'half_day') {
    if (km <= 100) return 'half_day_0_100km';
    if (km <= 150) return 'half_day_100_150km';
    return null;
  }
  if (rentalType === 'full_day') {
    if (km <= 150) return 'full_day_100_150km';
    if (km <= 200) return 'full_day_150_200km';
    return null;
  }
  return null;
}

export function parsePriceConfig(raw) {
  if (!raw) return { ...DEFAULT_CORPORATE_PRICE_CONFIG };
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_CORPORATE_PRICE_CONFIG };
  }
}

/**
 * Calculate base price for a corporate booking.
 * @returns {{ basePrice: number, priceKey: string, vehicleType: string, rentalType: string, estimatedKm: number }}
 */
export function calculateBasePrice({ vehicleType, rentalType, estimatedKm, priceConfig }) {
  if (!VEHICLE_TYPES.includes(vehicleType)) {
    throw new UnprocessableError('Loại xe không hợp lệ', 'INVALID_VEHICLE_TYPE');
  }
  if (!RENTAL_TYPES.includes(rentalType)) {
    throw new UnprocessableError('Loại thuê không hợp lệ', 'INVALID_RENTAL_TYPE');
  }
  const km = Number(estimatedKm);
  if (!Number.isFinite(km) || km <= 0) {
    throw new UnprocessableError('Km ước tính phải > 0', 'INVALID_KM');
  }

  const config = parsePriceConfig(priceConfig);
  const vehiclePrices = config[vehicleType];
  if (!vehiclePrices) {
    throw new UnprocessableError(
      `Không có bảng giá cho loại xe ${vehicleType}`,
      'PRICE_CONFIG_NOT_FOUND'
    );
  }

  const priceKey = resolvePriceKey(rentalType, km);
  if (!priceKey || vehiclePrices[priceKey] == null) {
    throw new UnprocessableError(
      `Không có bảng giá cho ${vehicleType} / ${rentalType} / ${km}km`,
      'PRICE_CONFIG_NOT_FOUND'
    );
  }

  const basePrice = Math.round(Number(vehiclePrices[priceKey]));
  return { basePrice, priceKey, vehicleType, rentalType, estimatedKm: km };
}

/** AssetHub unit rates for variable expenses (VND). */
export const EXPENSE_UNIT_RATES = {
  EXTRA_KM: { '4_5_seat': 5500, '7_seat': 6000, '16_seat': 7000 },
  ONE_WAY_KM: { '4_5_seat': 11000, '7_seat': 13000, '16_seat': 15000 },
  OVERTIME: { '4_5_seat': 50000, '7_seat': 50000, '16_seat': 60000 }, // per hour
  OVERNIGHT: { '4_5_seat': 300000, '7_seat': 280000, '16_seat': 300000 }, // per night
};

/**
 * Suggest amount for a variable expense type (hint for FE / optional auto-calc).
 * quantity = hours | km | nights depending on type.
 */
export function suggestExpenseAmount(type, vehicleType, quantity) {
  const table = EXPENSE_UNIT_RATES[type];
  if (!table) return null;
  const rate = table[vehicleType];
  if (rate == null) return null;
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) return null;
  // Integer math: for overtime allow fractional hours via round(q * rate)
  return Math.round(q * rate);
}

export default {
  calculateBasePrice,
  resolvePriceKey,
  parsePriceConfig,
  suggestExpenseAmount,
  EXPENSE_UNIT_RATES,
  VEHICLE_TYPES,
  RENTAL_TYPES,
};
