// src/utils/pricing.js (ESM)
import dayjs from 'dayjs';
import { INSURANCE_PRICE, COUPON_TYPE } from '../config/constants.js';

export function calculateDays(startDate, endDate) {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const days = end.diff(start, 'day');
  return Math.max(days, 1);
}

export function computePricing({ startDate, endDate, pricePerDay, insuranceType, coupon }) {
  const numDays = calculateDays(startDate, endDate);
  const perDay = Number(pricePerDay);
  const basePrice = numDays * perDay;
  const insurancePricePerDay = INSURANCE_PRICE[insuranceType] || 0;
  const insuranceTotal = insurancePricePerDay * numDays;
  const subtotal = basePrice + insuranceTotal;

  let discountAmount = 0;
  if (coupon) {
    if (coupon.type === COUPON_TYPE.PERCENTAGE) {
      discountAmount = Math.floor(subtotal * (Number(coupon.value) / 100));
      if (coupon.max_discount && discountAmount > Number(coupon.max_discount)) {
        discountAmount = Number(coupon.max_discount);
      }
    } else if (coupon.type === COUPON_TYPE.FIXED) {
      discountAmount = Number(coupon.value);
    }
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const totalPrice = subtotal - discountAmount;
  return { num_days: numDays, price_per_day: perDay, base_price: basePrice, insurance_type: insuranceType, insurance_price_per_day: insurancePricePerDay, insurance_total: insuranceTotal, subtotal, discount_amount: discountAmount, total_price: totalPrice };
}
