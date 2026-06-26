// ─── Config constants (ESM) ─────────────────────────────────────────
export const BOOKING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  IN_USE: 'IN_USE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
};

export const INSURANCE_TYPE = {
  NONE: 'NONE',
  BASIC: 'BASIC',
  PREMIUM: 'PREMIUM',
};

export const INSURANCE_PRICE = {
  [INSURANCE_TYPE.NONE]: 0,
  [INSURANCE_TYPE.BASIC]: 50000,
  [INSURANCE_TYPE.PREMIUM]: 120000,
};

export const COUPON_TYPE = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
};

export const REDIS_KEY = {
  BOOKING_HOLD: 'booking:hold:',
  BOOKING_LOCK: 'booking:lock:',
};

export const TTL = {
  DRAFT: (parseInt(process.env.BOOKING_DRAFT_TTL_MINUTES, 10) || 15) * 60,
  PAYMENT: (parseInt(process.env.BOOKING_PAYMENT_TTL_MINUTES, 10) || 15) * 60,
};

export const ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  CAR_OWNER: 'CAR_OWNER',
};
