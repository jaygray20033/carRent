// src/api/v1/agent-applications/agentApplication.validator.js
// Day 38 (UC-32/33) — agent (car owner) application submission + admin review.
import { z } from 'zod';

export const createApplicationSchema = z.object({
  applicantType: z.enum(['INDIVIDUAL', 'BUSINESS']).default('INDIVIDUAL'),
  businessName: z.string().trim().min(2, 'Vui lòng nhập tên đối tác').max(160),
  taxCode: z
    .string()
    .trim()
    .regex(/^[0-9-]{8,20}$/, 'Mã số thuế không hợp lệ')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().min(3, 'Vui lòng nhập địa chỉ').max(300),
  expectedVehicleCount: z.coerce
    .number()
    .int()
    .min(1, 'Tối thiểu 1 xe')
    .max(1000, 'Số lượng không hợp lệ')
    .default(1),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const listQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

export const reviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    reviewNote: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .refine((v) => v.status === 'APPROVED' || (v.reviewNote && v.reviewNote.trim().length > 0), {
    message: 'Vui lòng nhập lý do khi từ chối',
    path: ['reviewNote'],
  });

export default { createApplicationSchema, idParamSchema, listQuerySchema, reviewSchema };
