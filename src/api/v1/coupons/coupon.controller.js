// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.controller.js
//  Day 12 — UC-16: POST /coupons/validate
// ─────────────────────────────────────────────────────────────────────
import { couponService } from './coupon.service.js';
import { validateCouponSchema } from './coupon.validator.js';
import { ValidationError } from '../../../utils/apiError.js';
import { success } from '../../../utils/apiResponse.js';

/**
 * POST /api/v1/coupons/validate
 * Validate a coupon code against a booking.
 * Body: { code, bookingId }
 */
export async function validateCoupon(req, res, next) {
  try {
    const parsed = validateCouponSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message }))
      );
    }

    const { code, bookingId } = parsed.data;
    const result = await couponService.validate(code, bookingId, req.user.id);
    return success(res, result, 'Coupon is valid');
  } catch (error) {
    next(error);
  }
}

export default { validateCoupon };
