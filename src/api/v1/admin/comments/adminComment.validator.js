// src/api/v1/admin/comments/adminComment.validator.js
import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

// GET /admin/comments?status=&page=&size=
export const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

// PATCH /admin/comments/:id — body { status }
export const moderateSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

export default { idParamSchema, listQuerySchema, moderateSchema };
