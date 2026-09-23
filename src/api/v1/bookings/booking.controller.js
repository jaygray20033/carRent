// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.controller.js — Booking handlers
//    UC-14 createDraft · UC-15 updateDraft · UC-16 confirm
// ─────────────────────────────────────────────────────────────────────
import { bookingService } from './booking.service.js';
import {
  createDraftSchema,
  updateDraftSchema,
  confirmBookingSchema,
} from '../../../validators/booking.validator.js';
import { ValidationError } from '../../../utils/apiError.js';
import { success, created } from '../../../utils/apiResponse.js';

const toFieldErrors = (zodError) =>
  zodError.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));

// POST /api/v1/bookings/draft
export async function createDraft(req, res, next) {
  try {
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));

    const {
      vehicleId,
      pickup_at,
      return_at,
      pickup_point,
      dropoff_point,
      rental_type,
      premium_insurance,
    } = parsed.data;

    const result = await bookingService.createDraft({
      userId: req.user.id,
      vehicleId,
      pickupAt: pickup_at,
      returnAt: return_at,
      pickupPoint: pickup_point,
      dropoffPoint: dropoff_point,
      rentalType: rental_type,
      premiumInsurance: premium_insurance,
    });

    return created(res, result, 'Booking draft created successfully');
  } catch (error) {
    next(error);
  }
}

// PATCH /api/v1/bookings/:id
export async function updateDraft(req, res, next) {
  try {
    const bookingId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(bookingId)) throw new ValidationError([{ field: 'id', message: 'Invalid booking ID' }]);

    const parsed = updateDraftSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));

    const result = await bookingService.updateDraft(req.user.id, bookingId, parsed.data);
    return success(res, result, 'Booking draft updated successfully');
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/bookings/:id/confirm
export async function confirmBooking(req, res, next) {
  try {
    const bookingId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(bookingId)) throw new ValidationError([{ field: 'id', message: 'Invalid booking ID' }]);

    const parsed = confirmBookingSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));

    const result = await bookingService.confirm(req.user.id, bookingId, {
      couponCode: parsed.data.coupon_code,
    });
    return success(res, result, 'Booking confirmed, awaiting payment');
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/bookings
export async function listMyBookings(req, res, next) {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 12;
    const result = await bookingService.listByUser(req.user.id, {
      page,
      limit,
      status: req.query.status,
    });
    return success(res, result, 'Bookings fetched');
  } catch (error) {
    next(error);
  }
}

// GET /api/v1/bookings/:id
export async function getBookingDetail(req, res, next) {
  try {
    const bookingId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(bookingId)) throw new ValidationError([{ field: 'id', message: 'Invalid booking ID' }]);

    const result = await bookingService.getById(req.user.id, req.user.role?.code, bookingId);
    return success(res, result, 'Booking detail fetched');
  } catch (error) {
    next(error);
  }
}

// POST /api/v1/bookings/:id/cancel
export async function cancelBooking(req, res, next) {
  try {
    const bookingId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(bookingId)) throw new ValidationError([{ field: 'id', message: 'Invalid booking ID' }]);

    const result = await bookingService.cancel(
      req.user.id,
      req.user.role?.code,
      bookingId,
      req.body?.reason
    );
    return success(res, result, 'Booking cancelled');
  } catch (error) {
    next(error);
  }
}

export default {
  createDraft,
  updateDraft,
  confirmBooking,
  listMyBookings,
  getBookingDetail,
  cancelBooking,
};
