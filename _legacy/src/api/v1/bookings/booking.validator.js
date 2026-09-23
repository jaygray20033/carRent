// src/api/v1/bookings/booking.validator.js
import { z } from 'zod';

export const createBookingSchema = z
  .object({
    vehicleId: z.union([z.string(), z.number()]).transform((v) => v.toString()),
    pickupStationId: z.number().int().optional(),
    dropoffStationId: z.number().int().optional(),
    insurancePlanId: z.number().int().optional(),
    rentalType: z.enum(['SELF_DRIVE', 'WITH_DRIVER']).default('SELF_DRIVE'),
    pickupAt: z.string().datetime(),
    returnAt: z.string().datetime(),
    insuranceFee: z.number().min(0).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((d) => new Date(d.returnAt) > new Date(d.pickupAt), {
    message: 'returnAt must be after pickupAt',
    path: ['returnAt'],
  });

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z
    .enum(['DRAFT', 'PENDING_PAYMENT', 'CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELLED', 'REFUNDED'])
    .optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().min(2).max(500).optional(),
});
