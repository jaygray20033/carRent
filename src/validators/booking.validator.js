// ─────────────────────────────────────────────────────────────────────
//  src/validators/booking.validator.js — Zod schemas for booking (UC-08)
// ─────────────────────────────────────────────────────────────────────
import { z } from 'zod';
import dayjs from 'dayjs';

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
      // Pickup must be at least 2 hours from now
      return pickup.isAfter(dayjs().add(2, 'hour'));
    },
    { message: 'pickup_at must be at least 2 hours from now', path: ['pickup_at'] }
  );

export default { createDraftSchema };
