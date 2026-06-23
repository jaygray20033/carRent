// ─────────────────────────────────────────────────────────────────────
//  src/api/v1/bookings/booking.controller.js — Booking handlers
// ─────────────────────────────────────────────────────────────────────
import bookingService from '../../../services/bookingService.js';
import { createDraftSchema } from '../../../validators/booking.validator.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * POST /api/v1/bookings/draft
 * Create a draft booking with 15-min hold.
 */
export async function createDraft(req, res, next) {
  try {
    // Validate request body (UC-08)
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

    // req.user is set by auth middleware
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

export default { createDraft };
