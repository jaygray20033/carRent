// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.controller.js — Booking handlers
//  Day 11: createDraft (UC-14)
//  Day 12: updateDraft (UC-15)
// ─────────────────────────────────────────────────────────────────────
import bookingService from '../../../services/bookingService.js';
import { createDraftSchema, updateDraftSchema } from '../../../validators/booking.validator.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * POST /api/v1/bookings/draft
 * Create a draft booking with 15-min hold.
 */
export async function createDraft(req, res, next) {
  try {
    const parsed = createDraftSchema.safeParse(req.body);
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

    const {
      vehicleId,
      pickup_at,
      return_at,
      pickup_point,
      dropoff_point,
      rental_type,
      premium_insurance,
    } = parsed.data;

    const userId = req.user.id;

    const result = await bookingService.createDraft({
      userId,
      vehicleId,
      pickupAt: pickup_at,
      returnAt: return_at,
      pickupPoint: pickup_point,
      dropoffPoint: dropoff_point,
      rentalType: rental_type,
      premiumInsurance: premium_insurance,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Booking draft created successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
        ...(error.details && { details: error.details }),
      });
    }
    next(error);
  }
}

/**
 * PATCH /api/v1/bookings/:id
 * Update a DRAFT booking (only own DRAFT): insurance_plan_id, dropoff_point, recompute pricing.
 */
export async function updateDraft(req, res, next) {
  try {
    const bookingId = parseInt(req.params.id, 10);
    if (isNaN(bookingId)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid booking ID' });
    }

    const parsed = updateDraftSchema.safeParse(req.body);
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

    const userId = req.user.id;
    const result = await bookingService.updateDraft(userId, bookingId, parsed.data);

    return res.status(200).json({
      status: 'success',
      message: 'Booking draft updated successfully',
      data: result,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
        ...(error.details && { details: error.details }),
      });
    }
    next(error);
  }
}

export default { createDraft, updateDraft };
