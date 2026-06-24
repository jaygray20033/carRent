const BookingService = require('../services/BookingService');
const { success, created, error } = require('../utils/response');

/**
 * POST /api/v1/bookings
 * Create a DRAFT booking
 */
async function createDraftBooking(req, res, next) {
  try {
    const { car_id, start_date, end_date, pickup_time, return_time, pickup_location, renter_note } = req.body;

    if (!car_id || !start_date || !end_date) {
      return error(res, 'car_id, start_date, end_date are required', 400);
    }

    const booking = await BookingService.createDraft({
      renterId: req.user.id,
      carId: car_id,
      startDate: start_date,
      endDate: end_date,
      pickupTime: pickup_time,
      returnTime: return_time,
      pickupLocation: pickup_location,
      renterNote: renter_note,
    });

    return created(res, booking, 'Draft booking created');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/bookings/:id/confirm
 * Confirm booking: DRAFT → PENDING_PAYMENT
 */
async function confirmBooking(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return error(res, 'Invalid booking ID', 400);
    }

    const booking = await BookingService.confirmBooking(bookingId, req.user.id);

    // Reload with full data
    const detail = await BookingService.getBookingDetail(bookingId, req.user.id, req.user.role);

    return success(res, detail, 'Booking confirmed. Please complete payment within 15 minutes.');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/bookings/:id
 * Get booking detail with pricing breakdown
 */
async function getBookingDetail(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return error(res, 'Invalid booking ID', 400);
    }

    const detail = await BookingService.getBookingDetail(bookingId, req.user.id, req.user.role);

    return success(res, detail);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/bookings/:id/insurance
 * Update insurance type on DRAFT booking
 */
async function updateInsurance(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { insurance_type } = req.body;

    if (!insurance_type) {
      return error(res, 'insurance_type is required', 400);
    }

    const booking = await BookingService.updateInsurance(bookingId, req.user.id, insurance_type);
    return success(res, booking, 'Insurance updated');
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/bookings/:id/coupon
 * Apply or remove coupon on DRAFT booking
 */
async function applyCoupon(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    const { coupon_code } = req.body;

    const booking = await BookingService.applyCoupon(bookingId, req.user.id, coupon_code || null);
    return success(res, booking, coupon_code ? 'Coupon applied' : 'Coupon removed');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createDraftBooking,
  confirmBooking,
  getBookingDetail,
  updateInsurance,
  applyCoupon,
};
