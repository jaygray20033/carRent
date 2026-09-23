// src/api/v1/admin/bookings/adminBooking.validator.js
import { z } from 'zod';

const BOOKING_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'IN_USE',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// GET /admin/bookings — list filters (UC-54).
export const adminListBookingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().max(120).optional(),
  assignedStaffId: z.coerce.number().int().positive().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
});

// POST /admin/bookings/:id/note — internal note (timeline entry).
export const addNoteSchema = z.object({
  note: z.string().min(1, 'Note is required').max(1000),
});

// POST /admin/bookings/:id/confirm-payment — manual offline settlement.
export const confirmPaymentSchema = z.object({
  method: z.enum(['BANK_TRANSFER', 'CASH']).optional(),
  note: z.string().max(500).optional(),
});

// GET /admin/bookings/upcoming-pickups — CONFIRMED pickups in the next N hours.
export const upcomingPickupsQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).optional(),
  unassigned: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  assignedStaffId: z.coerce.number().int().positive().optional(),
});

// POST /admin/bookings/:id/assign-staff — assign a handover agent.
export const assignStaffSchema = z.object({
  staffId: z.coerce.number().int().positive('staffId là bắt buộc'),
});

// POST /admin/bookings/:id/refund — admin override (bypasses time window).
export const adminRefundSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  refundPercent: z.coerce.number().int().min(0).max(100).optional(),
});

// POST /admin/bookings/:id/return — optional extra fee (fuel/charge/damage).
export const returnBookingSchema = z.object({
  extraFee: z.coerce.number().min(0).max(1_000_000_000).optional(),
  note: z.string().max(500).optional(),
});

export default {
  idParamSchema,
  adminRefundSchema,
  returnBookingSchema,
  adminListBookingsQuerySchema,
  addNoteSchema,
  confirmPaymentSchema,
  upcomingPickupsQuerySchema,
  assignStaffSchema,
};
