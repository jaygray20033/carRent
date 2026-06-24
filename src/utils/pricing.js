const dayjs = require('dayjs');
const { INSURANCE_PRICE, COUPON_TYPE } = require('../config/constants');

/**
 * Calculate number of rental days (inclusive)
 */
function calculateDays(startDate, endDate) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const days = end.diff(start, 'day');
  return Math.max(days, 1); // minimum 1 day
}

/**
 * Recompute full pricing breakdown for a booking
 * This is used at confirm time to prevent FE tampering
 *
 * @param {Object} params
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {number} params.pricePerDay - from car record
 * @param {string} params.insuranceType - NONE | BASIC | PREMIUM
 * @param {Object|null} params.coupon - coupon record if applied
 * @returns {Object} pricing breakdown
 */
function computePricing({ startDate, endDate, pricePerDay, insuranceType, coupon }) {
  const numDays = calculateDays(startDate, endDate);
  const perDay = Number(pricePerDay);

  // Base rental
  const basePrice = numDays * perDay;

  // Insurance
  const insurancePricePerDay = INSURANCE_PRICE[insuranceType] || 0;
  const insuranceTotal = insurancePricePerDay * numDays;

  // Subtotal before discount
  const subtotal = basePrice + insuranceTotal;

  // Coupon discount
  let discountAmount = 0;
  if (coupon) {
    if (coupon.type === COUPON_TYPE.PERCENTAGE) {
      discountAmount = Math.floor(subtotal * (Number(coupon.value) / 100));
      // Cap at max_discount if set
      if (coupon.max_discount && discountAmount > Number(coupon.max_discount)) {
        discountAmount = Number(coupon.max_discount);
      }
    } else if (coupon.type === COUPON_TYPE.FIXED) {
      discountAmount = Number(coupon.value);
    }
    // discount cannot exceed subtotal
    discountAmount = Math.min(discountAmount, subtotal);
  }

  // Total
  const totalPrice = subtotal - discountAmount;

  return {
    num_days: numDays,
    price_per_day: perDay,
    base_price: basePrice,
    insurance_type: insuranceType,
    insurance_price_per_day: insurancePricePerDay,
    insurance_total: insuranceTotal,
    subtotal,
    discount_amount: discountAmount,
    total_price: totalPrice,
  };
}

module.exports = { computePricing, calculateDays };
