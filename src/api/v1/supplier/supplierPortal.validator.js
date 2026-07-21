// Validators for the supplier portal (Phase C).
import { z } from 'zod';

export const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const listBookingsQuerySchema = z.object({
  status: z
    .enum([
      'DISPATCHED',
      'DRIVER_ASSIGNED',
      'IN_PROGRESS',
      'PENDING_CONFIRM',
      'CONFIRMED',
      'SETTLED',
    ])
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const assignDriverSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  vehicleNote: z.string().trim().max(500).optional().nullable(),
  licensePlate: z.string().trim().max(30).optional().nullable(),
});

export const rejectSchema = z.object({
  reason: z.string().trim().min(1, 'Vui lòng nhập lý do từ chối').max(1000),
});

export const completeSchema = z.object({
  actualKm: z.coerce.number().positive('actualKm phải > 0'),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const memberIdParamSchema = z.object({
  memberId: z.coerce.number().int().positive(),
});

export const settlementIdParamSchema = z.object({
  settlementId: z.coerce.number().int().positive(),
});

export default {
  bookingIdParamSchema,
  listBookingsQuerySchema,
  assignDriverSchema,
  rejectSchema,
  completeSchema,
  memberIdParamSchema,
  settlementIdParamSchema,
};
