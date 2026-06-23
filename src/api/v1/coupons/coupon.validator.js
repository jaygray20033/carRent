// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.validator.js — Zod schema for coupon validate
//  Day 12 — UC-16
// ─────────────────────────────────────────────────────────────────────
import { z } from 'zod';

export const validateCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Coupon code is required')
    .transform((v) => v.trim().toUpperCase()),
  bookingId: z.number().int().positive('bookingId must be a positive integer'),
});

export default { validateCouponSchema };
