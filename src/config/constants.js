// Booking statuses
const BOOKING_STATUS = {
  DRAFT: 'DRAFT',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PAID: 'PAID',
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
};

// Insurance types
const INSURANCE_TYPE = {
  NONE: 'NONE',
  BASIC: 'BASIC',
  PREMIUM: 'PREMIUM',
};

// Insurance pricing (VND/day)
const INSURANCE_PRICE = {
  [INSURANCE_TYPE.NONE]: 0,
  [INSURANCE_TYPE.BASIC]: 50000,
  [INSURANCE_TYPE.PREMIUM]: 120000,
};

// Coupon types
const COUPON_TYPE = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED: 'FIXED',
};

// Redis key prefixes
const REDIS_KEY = {
  BOOKING_HOLD: 'booking:hold:', // booking:hold:{carId}:{startDate}:{endDate}
  BOOKING_LOCK: 'booking:lock:', // booking:lock:{bookingId}
};

// TTL defaults (seconds)
const TTL = {
  DRAFT: (parseInt(process.env.BOOKING_DRAFT_TTL_MINUTES, 10) || 15) * 60,
  PAYMENT: (parseInt(process.env.BOOKING_PAYMENT_TTL_MINUTES, 10) || 15) * 60,
};

// Roles
const ROLE = {
  USER: 'USER',
  ADMIN: 'ADMIN',
  CAR_OWNER: 'CAR_OWNER',
};

module.exports = {
  BOOKING_STATUS,
  INSURANCE_TYPE,
  INSURANCE_PRICE,
  COUPON_TYPE,
  REDIS_KEY,
  TTL,
  ROLE,
};
