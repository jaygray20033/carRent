const { Coupon, CouponUsage } = require('../models');
const dayjs = require('dayjs');

class CouponService {
  /**
   * Validate coupon for a user and order value
   * @returns {Object} { valid: boolean, coupon: Coupon|null, error: string|null }
   */
  async validateCoupon(couponCode, userId, orderSubtotal) {
    const coupon = await Coupon.findOne({ where: { code: couponCode } });

    if (!coupon) {
      return { valid: false, coupon: null, error: 'Coupon not found' };
    }

    if (!coupon.is_active) {
      return { valid: false, coupon: null, error: 'Coupon is not active' };
    }

    // Check date range
    const now = dayjs();
    if (coupon.starts_at && now.isBefore(dayjs(coupon.starts_at))) {
      return { valid: false, coupon: null, error: 'Coupon is not yet valid' };
    }
    if (coupon.expires_at && now.isAfter(dayjs(coupon.expires_at))) {
      return { valid: false, coupon: null, error: 'Coupon has expired' };
    }

    // Check total usage limit
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      return { valid: false, coupon: null, error: 'Coupon usage limit reached' };
    }

    // Check per-user usage limit
    const userUsageCount = await CouponUsage.count({
      where: { coupon_id: coupon.id, user_id: userId },
    });
    if (userUsageCount >= coupon.per_user_limit) {
      return { valid: false, coupon: null, error: 'You have already used this coupon' };
    }

    // Check min order value
    if (orderSubtotal < Number(coupon.min_order_value)) {
      return {
        valid: false,
        coupon: null,
        error: `Minimum order value is ${coupon.min_order_value} VND`,
      };
    }

    return { valid: true, coupon, error: null };
  }
}

module.exports = new CouponService();
