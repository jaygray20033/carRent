// src/api/v1/admin/bookings/adminBooking.validator.js
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// POST /admin/bookings/:id/refund — admin override (bypasses time window).
export const adminRefundSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  refundPercent: z.coerce.number().int().min(0).max(100).optional(),
});

export default { idParamSchema, adminRefundSchema };
