// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/coupons/coupon.service.js
//  Day 12 — UC-16: Coupon validation logic
// ─────────────────────────────────────────────────────────────────────
import prisma from '../../../config/prisma.js';
import { AppError } from '../../../utils/AppError.js';

export const couponService = {
  async validate(code, bookingId, userId) {
    const now = new Date();

    // 1. Find coupon
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon) {
      throw new AppError(422, 'Coupon not found', { code: 'COUPON_INVALID' });
    }
    if (!coupon.isActive) {
      throw new AppError(422, 'Coupon is no longer active', { code: 'COUPON_INVALID' });
    }
    if (now < new Date(coupon.startAt)) {
      throw new AppError(422, 'Coupon is not yet valid', { code: 'COUPON_INVALID' });
    }
    if (now > new Date(coupon.endAt)) {
      throw new AppError(422, 'Coupon has expired', { code: 'COUPON_INVALID' });
    }

    // 2. Find booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { vehicle: true },
    });
    if (!booking) {
      throw new AppError(404, 'Booking not found');
    }
    if (booking.userId !== userId) {
      throw new AppError(403, 'Not your booking');
    }
    if (booking.status !== 'DRAFT') {
      throw new AppError(400, 'Coupon can only be applied to DRAFT bookings');
    }

    // 3. min_order check
    const subtotal = booking.subtotal || booking.pricePerDay * booking.totalDays;
    if (coupon.minOrder > 0 && subtotal < coupon.minOrder) {
      throw new AppError(422, `Minimum order is ${coupon.minOrder.toLocaleString('vi-VN')} VND`, {
        code: 'COUPON_INVALID',
      });
    }

    // 4. Global usage check (max_use: 0 = unlimited)
    if (coupon.maxUse > 0) {
      const globalUsage = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
      if (globalUsage >= coupon.maxUse) {
        throw new AppError(422, 'Coupon usage limit reached', { code: 'COUPON_INVALID' });
      }
    }

    // 5. Per-user usage check
    const userUsage = await prisma.couponUsage.count({
      where: { couponId: coupon.id, userId },
    });
    if (userUsage >= coupon.maxUsePerUser) {
      throw new AppError(422, 'You have already used this coupon', { code: 'COUPON_INVALID' });
    }

    // 6. Calculate discount based on type
    let discount; // ✅ không gán giá trị mặc định
    let message; // ✅ không gán giá trị mặc định

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
        throw new AppError(422, 'Unknown coupon type', { code: 'COUPON_INVALID' });
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
