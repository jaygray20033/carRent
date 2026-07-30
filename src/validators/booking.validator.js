// ─────────────────────────────────────────────────────────────────────
//  src/validators/booking.validator.js — Zod schemas for booking
//  Day 11: createDraftSchema (UC-08/UC-14)
//  Day 12: updateDraftSchema (UC-15)
// ─────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import dayjs from 'dayjs';

/**
 * POST /api/v1/bookings/draft
 */
export const createDraftSchema = z
  .object({
    vehicleId: z.number().int().positive('vehicleId must be a positive integer'),
    pickup_at: z.string().refine((val) => dayjs(val).isValid(), {
      message: 'pickup_at must be a valid ISO datetime string',
    }),
    return_at: z.string().refine((val) => dayjs(val).isValid(), {
      message: 'return_at must be a valid ISO datetime string',
    }),
    pickup_point: z.string().min(1, 'pickup_point is required'),
    dropoff_point: z.string().min(1, 'dropoff_point is required'),
    rental_type: z.enum(['SELF_DRIVE', 'WITH_DRIVER']).default('SELF_DRIVE'),
    premium_insurance: z.boolean().optional().default(false),
  })
  .refine(
    (data) => {
      const pickup = dayjs(data.pickup_at);
      const returnDate = dayjs(data.return_at);
      return returnDate.isAfter(pickup);
    },
    { message: 'return_at must be after pickup_at', path: ['return_at'] }
  )
  .refine(
    (data) => {
      const pickup = dayjs(data.pickup_at);
      return pickup.isAfter(dayjs().add(2, 'hour'));
    },
    { message: 'pickup_at must be at least 2 hours from now', path: ['pickup_at'] }
  );

/**
 * PATCH /api/v1/bookings/:id  — update a DRAFT booking
 * Allowed fields: insurance_plan_id, dropoff_point
 * At least one field must be provided.
 */
export const updateDraftSchema = z
  .object({
    insurancePlanId: z.number().int().positive().nullable().optional(),
    dropoffPoint: z.string().min(1).optional(),
  })
  .refine((data) => data.insurancePlanId !== undefined || data.dropoffPoint !== undefined, {
    message: 'At least one of insurancePlanId or dropoffPoint must be provided',
  });

/**
 * POST /api/v1/bookings/:id/confirm  — DRAFT → PENDING_PAYMENT
 * Optional coupon_code to apply at confirmation time.
 */
export const confirmBookingSchema = z.object({
  coupon_code: z.string().min(2).max(50).optional(),
});

export default { createDraftSchema, updateDraftSchema, confirmBookingSchema };
