// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.controller.js
//  Day 12 — UC-16: POST /coupons/validate
// ─────────────────────────────────────────────────────────────────────
import { couponService } from './coupon.service.js';
import { validateCouponSchema } from './coupon.validator.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * POST /api/v1/coupons/validate
 * Validate a coupon code against a booking.
 * Body: { code, bookingId }
 * Response: { valid: true, discount, message } or 422 COUPON_INVALID
 */
export async function validateCoupon(req, res, next) {
  try {
    // Validate request body
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed',
        errors,
      });
    }

    const { code, bookingId } = parsed.data;
    const userId = req.user.id;

    const result = await couponService.validate(code, bookingId, userId);

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      // For coupon validation errors, return 422 with COUPON_INVALID code
      const statusCode = error.statusCode;
      return res.status(statusCode).json({
        status: 'fail',
        message: error.message,
        code: error.details?.code || null,
      });
    }
    next(error);
  }
}

export default { validateCoupon };
