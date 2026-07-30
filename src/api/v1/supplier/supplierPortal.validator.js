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

export const addExpenseSchema = z.object({
  type: z.enum([
    'TOLL_ROAD',
    'PARKING',
    'OVERTIME',
    'EXTRA_KM',
    'ONE_WAY_KM',
    'OVERNIGHT',
    'OTHER',
  ]),
  amount: z.coerce.number().positive('Số tiền phải > 0'),
  description: z.string().trim().max(1000).optional().nullable(),
  receiptUrl: z.string().trim().url().optional().nullable().or(z.literal('')),
});

export const expenseIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  expenseId: z.coerce.number().int().positive(),
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
  addExpenseSchema,
  expenseIdParamSchema,
  memberIdParamSchema,
  settlementIdParamSchema,
};
