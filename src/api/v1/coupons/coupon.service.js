// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.service.js
//  Day 12 — UC-16: Coupon validation logic
// ─────────────────────────────────────────────────────────────────────
import prisma from '../../../config/db.js';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  UnprocessableError,
} from '../../../utils/apiError.js';

export const couponService = {
  async validate(code, bookingId, userId) {
    const now = new Date();

    // 1. Find coupon
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new UnprocessableError('Coupon not found', 'COUPON_INVALID');
    if (!coupon.isActive)
      throw new UnprocessableError('Coupon is no longer active', 'COUPON_INVALID');
    if (now < new Date(coupon.startAt))
      throw new UnprocessableError('Coupon is not yet valid', 'COUPON_INVALID');
    if (now > new Date(coupon.endAt))
      throw new UnprocessableError('Coupon has expired', 'COUPON_INVALID');

    // 2. Find booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { vehicle: true },
    });
    if (!booking) throw new NotFoundError('Booking');
    if (booking.userId !== userId) throw new ForbiddenError('Not your booking');
    if (booking.status !== 'DRAFT')
      throw new AppError('Coupon can only be applied to DRAFT bookings', 400, 'NOT_DRAFT');

    // 3. min_order check
    const subtotal = booking.subtotal || booking.pricePerDay * booking.totalDays;
    if (coupon.minOrder > 0 && subtotal < coupon.minOrder) {
      throw new UnprocessableError(
        `Minimum order is ${coupon.minOrder.toLocaleString('vi-VN')} VND`,
        'COUPON_INVALID'
      );
    }

    // 4. Global usage check (max_use: 0 = unlimited)
    if (coupon.maxUse > 0) {
      const globalUsage = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      if (globalUsage >= coupon.maxUse)
        throw new UnprocessableError('Coupon usage limit reached', 'COUPON_INVALID');
    }

    // 5. Per-user usage check
    const userUsage = await prisma.couponUsage.count({
      where: { couponId: coupon.id, userId },
    });
    if (userUsage >= coupon.maxUsePerUser)
      throw new UnprocessableError('You have already used this coupon', 'COUPON_INVALID');

    // 6. Calculate discount based on type
    let discount;
    let message;

    switch (coupon.type) {
      case 'FIXED':
        discount = coupon.value;
        message = `Discount ${coupon.value.toLocaleString('vi-VN')} VND`;
        break;

      case 'PERCENT':
        discount = Math.round(subtotal * (coupon.value / 100));
        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
          discount = coupon.maxDiscount;
        }
        message =
          `Discount ${coupon.value}%` +
          (coupon.maxDiscount ? ` (max ${coupon.maxDiscount.toLocaleString('vi-VN')} VND)` : '');
        break;

      case 'FREE_DRIVER': {
        const driverRate = 500000;
        const driverFee = driverRate * booking.totalDays;
        if (booking.rentalType === 'WITH_DRIVER') {
          discount = driverFee;
          message = `Free driver service (${driverFee.toLocaleString('vi-VN')} VND)`;
        } else {
          discount = 0;
          message = 'Coupon FREE_DRIVER only applies to WITH_DRIVER bookings. No discount applied.';
        }
        break;
      }

      default:
        throw new UnprocessableError('Unknown coupon type', 'COUPON_INVALID');
    }

    return {
      valid: true,
      discount,
      message,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
      },
    };
  },
};

export default couponService;
