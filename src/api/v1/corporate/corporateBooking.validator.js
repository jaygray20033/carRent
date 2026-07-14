// src/api/v1/corporate/corporateBooking.validator.js
import { z } from 'zod';

export const createBookingSchema = z.object({
  vehicleType: z.enum(['4_5_seat', '7_seat', '16_seat', '29_seat']),
  rentalType: z.enum(['half_day', 'full_day']),
  estimatedKm: z.coerce.number().positive('Km ước tính phải > 0'),
  pickupAt: z.coerce.date(),
  returnAt: z.coerce.date(),
  pickupAddress: z.string().trim().min(3).max(500),
  dropoffAddress: z.string().trim().min(3).max(500),
  purpose: z.string().trim().max(1000).optional().nullable(),
  vehicleId: z.coerce.number().int().positive().optional().nullable(),
});

export const listBookingsQuerySchema = z.object({
  status: z
    .enum([
      'PENDING',
      'APPROVED',
      'IN_PROGRESS',
      'PENDING_CONFIRM',
      'CONFIRMED',
      'SETTLED',
      'CANCELLED',
    ])
    .optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM')
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const bookingIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const approveBookingSchema = z.object({
  vehicleId: z.coerce.number().int().positive().optional().nullable(),
  driverId: z.coerce.number().int().positive().optional().nullable(),
});

export const rejectBookingSchema = z.object({
  reason: z.string().trim().min(1, 'Vui lòng nhập lý do từ chối').max(1000),
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
  recordedBy: z.enum(['driver', 'employee']).optional(),
});

export const expenseIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  expenseId: z.coerce.number().int().positive(),
});

export const approveExpenseSchema = z.object({
  approved: z.boolean(),
});

export const completeBookingSchema = z.object({
  actualKm: z.coerce.number().positive('actualKm phải > 0'),
  employeeNote: z.string().trim().max(2000).optional().nullable(),
});

/** UC-72 — OtoRent Admin list filters */
export const adminListBookingsQuerySchema = z.object({
  corporateId: z.coerce.number().int().positive().optional(),
  status: z
    .enum([
      'PENDING',
      'APPROVED',
      'IN_PROGRESS',
      'PENDING_CONFIRM',
      'CONFIRMED',
      'SETTLED',
      'CANCELLED',
    ])
    .optional(),
  driverId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const assignDriverSchema = z.object({
  driverId: z.coerce.number().int().positive(),
  vehicleId: z.coerce.number().int().positive().optional().nullable(),
});

export default {
  createBookingSchema,
  listBookingsQuerySchema,
  bookingIdParamSchema,
  approveBookingSchema,
  rejectBookingSchema,
  addExpenseSchema,
  expenseIdParamSchema,
  approveExpenseSchema,
  completeBookingSchema,
};
