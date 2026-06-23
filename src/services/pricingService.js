// ─────────────────────────────────────────────────────────────────────
//  src/services/pricingService.js — Pricing calculation (§UC-17)
// ─────────────────────────────────────────────────────────────────────
import dayjs from 'dayjs';

/**
 * Calculate the number of rental days.
 * Rule: Math.ceil(diffHours / 24), minimum 1.
 *
 * @param {Date|string} pickupAt
 * @param {Date|string} returnAt
 * @returns {number}
 */
export function calculateDays(pickupAt, returnAt) {
  const start = dayjs(pickupAt);
  const end = dayjs(returnAt);
  const diffHours = end.diff(start, 'hour', true); // floating point hours
  const days = Math.ceil(diffHours / 24);
  return Math.max(days, 1);
}

/**
 * Calculate full pricing breakdown for a booking.
 *
 * @param {object} params
 * @param {number} params.dailyRate        - Vehicle's price_per_day
 * @param {number} params.days             - Number of rental days
 * @param {boolean} params.withDriver      - Customer requested a driver
 * @param {number} [params.driverRate=500000] - Driver rate per day (VND)
 * @param {boolean} params.premiumInsurance - Premium insurance selected
 * @param {string} params.pickupPoint      - Pickup station/point
 * @param {string} params.dropoffPoint     - Drop-off station/point
 * @param {number} [params.couponValue=0]  - Coupon discount amount (sẽ thêm T5)
 * @param {number} [params.depositAmount=5000000] - Vehicle deposit
 * @returns {object} Pricing breakdown
 */
export function calculate({
  dailyRate,
  days,
  withDriver = false,
  driverRate = 500000,
  premiumInsurance = false,
  pickupPoint = '',
  dropoffPoint = '',
  couponValue = 0,
  depositAmount = 5000000,
}) {
  // Subtotal = daily_rate × days
  const subtotal = dailyRate * days;

  // Driver fee: driver_rate × days if with_driver
  const driverFee = withDriver ? driverRate * days : 0;

  // Insurance fee: 10% of subtotal if premium
  const insuranceFee = premiumInsurance ? Math.round(subtotal * 0.1) : 0;

  // Dropoff penalty: 200,000 VND if dropoff !== pickup
  const dropoffPenalty = dropoffPoint && pickupPoint && dropoffPoint !== pickupPoint ? 200000 : 0;

  // Tax: 10% of (subtotal + driver_fee)
  const tax = Math.round((subtotal + driverFee) * 0.1);

  // Discount (coupon — sẽ thêm Day T5)
  const discount = couponValue;

  // Deposit
  const deposit = depositAmount;

  // Total = subtotal + driver + insurance + dropoff + tax - discount + deposit
  const total = subtotal + driverFee + insuranceFee + dropoffPenalty + tax - discount + deposit;

  return {
    subtotal,
    driver_fee: driverFee,
    insurance_fee: insuranceFee,
    dropoff_penalty: dropoffPenalty,
    tax,
    discount,
    deposit,
    total,
    breakdown: {
      daily_rate: dailyRate,
      days,
      with_driver: withDriver,
      driver_rate: driverRate,
      premium_insurance: premiumInsurance,
      pickup_point: pickupPoint,
      dropoff_point: dropoffPoint,
    },
  };
}

export default { calculate, calculateDays };
