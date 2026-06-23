// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.routes.js
//  Day 12 — UC-16: Coupon routes
// ─────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import { validateCoupon } from './coupon.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';

const router = Router();

/**
 * POST /api/v1/coupons/validate
 * @description Validate coupon code against a booking
 * @access Private (requires authentication)
 * @body { code: string, bookingId: number }
 * @returns { valid: true, discount: number, message: string } or 422 COUPON_INVALID
 */
router.post('/validate', authenticate, validateCoupon);

export default router;
