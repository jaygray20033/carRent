const { sequelize, Booking, BookingHistory, CouponUsage, Car, Coupon } = require('../models');
const { BOOKING_STATUS, TTL, INSURANCE_TYPE } = require('../config/constants');
const { computePricing } = require('../utils/pricing');
const { generateBookingCode } = require('../utils/bookingCode');
const RedisLockService = require('./RedisLockService');
const CouponService = require('./CouponService');
const dayjs = require('dayjs');

class BookingService {
  /**
   * UC-17: Confirm booking (DRAFT → PENDING_PAYMENT)
   *
   * Steps:
   * 1. Validate booking is DRAFT and belongs to user
   * 2. Validate all required info
   * 3. Recompute pricing from car record (anti-tampering)
   * 4. Validate coupon if applied
   * 5. Atomic transaction:
   *    - Update Booking: status=PENDING_PAYMENT, pricing snapshot, hold_until + 15min
   *    - Insert BookingHistory
   *    - Insert CouponUsage (if coupon)
   *    - Increment coupon used_count
   * 6. Extend Redis hold TTL 15 min
   */
  async confirmBooking(bookingId, userId) {
    // 1. Fetch booking
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Car, as: 'car' }],
    });

    if (!booking) {
      throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
    }

    if (booking.renter_id !== userId) {
      throw Object.assign(new Error('Not authorized to confirm this booking'), { statusCode: 403 });
    }

    if (booking.status !== BOOKING_STATUS.DRAFT) {
      throw Object.assign(
        new Error(`Cannot confirm booking with status ${booking.status}. Expected DRAFT.`),
        { statusCode: 400 }
      );
    }

    // 2. Validate required fields
    if (!booking.start_date || !booking.end_date) {
      throw Object.assign(new Error('Start date and end date are required'), { statusCode: 400 });
    }

    if (!booking.car) {
      throw Object.assign(new Error('Car not found for this booking'), { statusCode: 400 });
    }

    // Check hold_until hasn't expired
    if (booking.hold_until && dayjs().isAfter(dayjs(booking.hold_until))) {
      throw Object.assign(
        new Error('Booking hold has expired. Please create a new booking.'),
        { statusCode: 410 }
      );
    }

    // 3. Recompute pricing from car record (anti-tampering)
    let coupon = null;
    if (booking.coupon_id) {
      coupon = await Coupon.findByPk(booking.coupon_id);
    }

    const insuranceType = booking.insurance_type || INSURANCE_TYPE.NONE;
    const pricing = computePricing({
      startDate: booking.start_date,
      endDate: booking.end_date,
      pricePerDay: booking.car.price_per_day,
      insuranceType,
      coupon,
    });

    // 4. Validate coupon if present
    if (coupon) {
      const validation = await CouponService.validateCoupon(
        coupon.code,
        userId,
        pricing.subtotal
      );
      if (!validation.valid) {
        throw Object.assign(new Error(`Coupon invalid: ${validation.error}`), { statusCode: 400 });
      }
    }

    // 5. Atomic transaction
    const newHoldUntil = dayjs().add(TTL.PAYMENT, 'second').toDate();

    const result = await sequelize.transaction(async (t) => {
      // Update booking
      await booking.update({
        status: BOOKING_STATUS.PENDING_PAYMENT,
        num_days: pricing.num_days,
        price_per_day: pricing.price_per_day,
        base_price: pricing.base_price,
        insurance_type: pricing.insurance_type,
        insurance_price_per_day: pricing.insurance_price_per_day,
        insurance_total: pricing.insurance_total,
        subtotal: pricing.subtotal,
        discount_amount: pricing.discount_amount,
        coupon_code: coupon ? coupon.code : null,
        total_price: pricing.total_price,
        hold_until: newHoldUntil,
        confirmed_at: new Date(),
      }, { transaction: t });

      // Insert BookingHistory
      await BookingHistory.create({
        booking_id: booking.id,
        from_status: BOOKING_STATUS.DRAFT,
        to_status: BOOKING_STATUS.PENDING_PAYMENT,
        changed_by: userId,
        reason: 'Booking confirmed by renter',
        metadata: {
          pricing_snapshot: pricing,
          coupon_code: coupon ? coupon.code : null,
        },
      }, { transaction: t });

      // Insert CouponUsage if coupon applied
      if (coupon) {
        await CouponUsage.create({
          coupon_id: coupon.id,
          user_id: userId,
          booking_id: booking.id,
          discount_amount: pricing.discount_amount,
        }, { transaction: t });

        // Increment coupon used_count
        await coupon.increment('used_count', { transaction: t });
      }

      return booking;
    });

    // 6. Extend Redis hold TTL
    try {
      await RedisLockService.extendHold(
        booking.car_id,
        booking.start_date,
        booking.end_date,
        booking.id,
        TTL.PAYMENT
      );
    } catch (redisErr) {
      console.error('[BookingService] Failed to extend Redis hold:', redisErr.message);
      // Non-fatal: DB is source of truth
    }

    return result;
  }

  /**
   * Get booking detail with breakdown
   * Accessible by: booking owner (renter), car owner, admin
   */
  async getBookingDetail(bookingId, userId, userRole) {
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Car,
          as: 'car',
          attributes: ['id', 'owner_id', 'brand', 'model', 'year', 'license_plate', 'price_per_day', 'location', 'seats', 'transmission', 'fuel_type', 'images'],
        },
        {
          model: BookingHistory,
          as: 'history',
          attributes: ['id', 'from_status', 'to_status', 'changed_by', 'reason', 'created_at'],
          order: [['created_at', 'ASC']],
        },
        {
          model: CouponUsage,
          as: 'couponUsage',
          include: [{
            model: Coupon,
            as: 'coupon',
            attributes: ['id', 'code', 'type', 'value', 'max_discount'],
          }],
        },
      ],
    });

    if (!booking) {
      throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
    }

    // Access control: renter, car owner, or admin
    const isRenter = booking.renter_id === userId;
    const isCarOwner = booking.car && booking.car.owner_id === userId;
    const isAdmin = userRole === 'ADMIN';

    if (!isRenter && !isCarOwner && !isAdmin) {
      throw Object.assign(new Error('Not authorized to view this booking'), { statusCode: 403 });
    }

    // Build pricing breakdown
    const breakdown = {
      num_days: booking.num_days,
      price_per_day: Number(booking.price_per_day) || null,
      base_price: Number(booking.base_price) || null,
      insurance: {
        type: booking.insurance_type,
        price_per_day: Number(booking.insurance_price_per_day) || 0,
        total: Number(booking.insurance_total) || 0,
      },
      coupon: booking.couponUsage ? {
        code: booking.coupon_code,
        type: booking.couponUsage.coupon?.type,
        value: booking.couponUsage.coupon?.value,
        discount_amount: Number(booking.discount_amount),
      } : null,
      subtotal: Number(booking.subtotal) || null,
      discount_amount: Number(booking.discount_amount) || 0,
      total_price: Number(booking.total_price) || null,
    };

    // Get Redis hold TTL if still active
    let holdInfo = null;
    if (
      booking.hold_until &&
      [BOOKING_STATUS.DRAFT, BOOKING_STATUS.PENDING_PAYMENT].includes(booking.status)
    ) {
      try {
        const ttl = await RedisLockService.getHoldTTL(
          booking.car_id,
          booking.start_date,
          booking.end_date
        );
        holdInfo = {
          hold_until: booking.hold_until,
          remaining_seconds: ttl > 0 ? ttl : 0,
          expired: ttl <= 0,
        };
      } catch (err) {
        holdInfo = {
          hold_until: booking.hold_until,
          remaining_seconds: null,
          expired: dayjs().isAfter(dayjs(booking.hold_until)),
        };
      }
    }

    return {
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        status: booking.status,
        renter_id: booking.renter_id,
        car_id: booking.car_id,
        start_date: booking.start_date,
        end_date: booking.end_date,
        pickup_time: booking.pickup_time,
        return_time: booking.return_time,
        pickup_location: booking.pickup_location,
        renter_note: booking.renter_note,
        confirmed_at: booking.confirmed_at,
        paid_at: booking.paid_at,
        cancelled_at: booking.cancelled_at,
        created_at: booking.created_at,
        updated_at: booking.updated_at,
      },
      car: booking.car,
      pricing_breakdown: breakdown,
      hold_info: holdInfo,
      history: booking.history,
    };
  }

  /**
   * Create a DRAFT booking (assumed to exist from previous days)
   * Included here for completeness and testing
   */
  async createDraft({ renterId, carId, startDate, endDate, pickupTime, returnTime, pickupLocation, renterNote }) {
    const car = await Car.findByPk(carId);
    if (!car || !car.is_available) {
      throw Object.assign(new Error('Car not available'), { statusCode: 400 });
    }

    // Check Redis for existing hold
    const existingHolder = await RedisLockService.checkHold(carId, startDate, endDate);
    if (existingHolder) {
      throw Object.assign(
        new Error('Car is already being held for these dates'),
        { statusCode: 409 }
      );
    }

    const bookingCode = generateBookingCode();
    const holdUntil = dayjs().add(TTL.DRAFT, 'second').toDate();

    const booking = await sequelize.transaction(async (t) => {
      const newBooking = await Booking.create({
        booking_code: bookingCode,
        renter_id: renterId,
        car_id: carId,
        status: BOOKING_STATUS.DRAFT,
        start_date: startDate,
        end_date: endDate,
        pickup_time: pickupTime,
        return_time: returnTime,
        pickup_location: pickupLocation || car.location,
        renter_note: renterNote,
        hold_until: holdUntil,
        insurance_type: 'NONE',
      }, { transaction: t });

      await BookingHistory.create({
        booking_id: newBooking.id,
        from_status: null,
        to_status: BOOKING_STATUS.DRAFT,
        changed_by: renterId,
        reason: 'Booking draft created',
      }, { transaction: t });

      return newBooking;
    });

    // Acquire Redis hold
    try {
      await RedisLockService.acquireHold(carId, startDate, endDate, booking.id, TTL.DRAFT);
    } catch (err) {
      console.error('[BookingService] Failed to acquire Redis hold:', err.message);
    }

    return booking;
  }

  /**
   * Update insurance type on DRAFT booking
   */
  async updateInsurance(bookingId, userId, insuranceType) {
    const booking = await Booking.findByPk(bookingId);
    if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
    if (booking.renter_id !== userId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    if (booking.status !== BOOKING_STATUS.DRAFT) {
      throw Object.assign(new Error('Can only update insurance on DRAFT booking'), { statusCode: 400 });
    }

    if (!Object.values(INSURANCE_TYPE).includes(insuranceType)) {
      throw Object.assign(new Error(`Invalid insurance type: ${insuranceType}`), { statusCode: 400 });
    }

    await booking.update({ insurance_type: insuranceType });
    return booking;
  }

  /**
   * Apply/remove coupon on DRAFT booking
   */
  async applyCoupon(bookingId, userId, couponCode) {
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: Car, as: 'car' }],
    });

    if (!booking) throw Object.assign(new Error('Booking not found'), { statusCode: 404 });
    if (booking.renter_id !== userId) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    if (booking.status !== BOOKING_STATUS.DRAFT) {
      throw Object.assign(new Error('Can only apply coupon on DRAFT booking'), { statusCode: 400 });
    }

    if (!couponCode) {
      // Remove coupon
      await booking.update({ coupon_id: null, coupon_code: null, discount_amount: 0 });
      return booking;
    }

    // Estimate subtotal for validation
    const pricing = computePricing({
      startDate: booking.start_date,
      endDate: booking.end_date,
      pricePerDay: booking.car.price_per_day,
      insuranceType: booking.insurance_type || 'NONE',
      coupon: null,
    });

    const validation = await CouponService.validateCoupon(couponCode, userId, pricing.subtotal);
    if (!validation.valid) {
      throw Object.assign(new Error(validation.error), { statusCode: 400 });
    }

    await booking.update({
      coupon_id: validation.coupon.id,
      coupon_code: validation.coupon.code,
    });

    return booking;
  }
}

module.exports = new BookingService();
