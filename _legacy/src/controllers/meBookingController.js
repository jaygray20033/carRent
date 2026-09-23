// ─────────────────────────────────────────────────────────────────────
//  src/controllers/meBookingController.js
//  Day 14: Booking history + List bookings of the current user
//    - GET /api/v1/me/bookings        (UC-47) list with status & pagination
//    - GET /api/v1/me/bookings/:id     (UC-48) booking detail (+ history)
// ─────────────────────────────────────────────────────────────────────
const BookingService = require('../services/bookingService');
const { success, error } = require('../utils/response');

/**
 * GET /api/v1/me/bookings?status=&page=&limit=
 * List bookings belonging to the authenticated user.
 *
 * Query params:
 *   - status : optional. One or more booking statuses (comma-separated),
 *              e.g. ?status=PAID or ?status=DRAFT,PENDING_PAYMENT
 *   - page   : optional, default 1
 *   - limit  : optional, default 10 (max 50)
 */
async function listMyBookings(req, res, next) {
  try {
    const { status, page, limit } = req.query;

    const result = await BookingService.listMyBookings({
      userId: req.user.id,
      status,
      page,
      limit,
    });

    return success(res, result, 'My bookings retrieved');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/v1/me/bookings/:id
 * Detail of one booking owned by the authenticated user (includes history).
 */
async function getMyBookingDetail(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return error(res, 'Invalid booking ID', 400);
    }

    const detail = await BookingService.getMyBookingDetail(bookingId, req.user.id);

    return success(res, detail, 'Booking detail retrieved');
  } catch (err) {
    if (err.statusCode) {
      return error(res, err.message, err.statusCode);
    }
    next(err);
  }
}

module.exports = {
  listMyBookings,
  getMyBookingDetail,
};
