// Default AssetHub B2B price table (VND). Stored as JSON on CorporateClient.priceConfig.
export const DEFAULT_CORPORATE_PRICE_CONFIG = {
  '4_5_seat': {
    half_day_0_100km: 600000,
    half_day_100_150km: 800000,
    full_day_100_150km: 1000000,
    full_day_150_200km: 1200000,
  },
  '7_seat': {
    half_day_0_100km: 700000,
    half_day_100_150km: 1000000,
    full_day_100_150km: 1100000,
    full_day_150_200km: 1300000,
  },
  '16_seat': {
    half_day_0_100km: 800000,
    half_day_100_150km: 1200000,
    full_day_100_150km: 1300000,
    full_day_150_200km: 1500000,
  },
};

export const CORPORATE_BOOKING_STATUSES = [
  'PENDING',
  'APPROVED',
  'IN_PROGRESS',
  'PENDING_CONFIRM',
  'CONFIRMED',
  'SETTLED',
  'CANCELLED',
];

export const TRIP_EXPENSE_TYPES = [
  'TOLL_ROAD',
  'PARKING',
  'OVERTIME',
  'EXTRA_KM',
  'ONE_WAY_KM',
  'OVERNIGHT',
  'OTHER',
];

export const SETTLEMENT_STATUSES = ['DRAFT', 'SENT', 'CONFIRMED', 'PAID', 'DISPUTED'];

/** Invite token TTL — 48 hours. */
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export default {
  DEFAULT_CORPORATE_PRICE_CONFIG,
  CORPORATE_BOOKING_STATUSES,
  TRIP_EXPENSE_TYPES,
  SETTLEMENT_STATUSES,
  INVITE_TTL_MS,
};
