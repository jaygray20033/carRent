// Supplier (nhà xe) partner application — submission + admin review.
// Mirrors agent-application: plain String status state machine (PENDING/APPROVED/REJECTED).
import { z } from 'zod';

export const createSupplierApplicationSchema = z.object({
  applicantType: z.enum(['INDIVIDUAL', 'BUSINESS']).default('BUSINESS'),
  companyName: z.string().trim().min(2, 'Vui lòng nhập tên nhà xe / doanh nghiệp').max(191),
  taxCode: z
    .string()
    .trim()
    .regex(/^[0-9-]{8,20}$/, 'Mã số thuế không hợp lệ')
    .optional()
    .or(z.literal('')),
  contactName: z.string().trim().max(120).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(30).optional().or(z.literal('')),
  contactEmail: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')),
  address: z.string().trim().min(3, 'Vui lòng nhập địa chỉ').max(300),
  transportLicenseNo: z.string().trim().max(80).optional().or(z.literal('')),
  fleetSize: z.coerce
    .number()
    .int()
    .min(1, 'Tối thiểu 1 xe')
    .max(5000, 'Số lượng không hợp lệ')
    .default(1),
  vehicleTypes: z.string().trim().max(200).optional().or(z.literal('')),
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
    commissionRate: z.coerce.number().min(0).max(1).optional(),
  })
  .refine((v) => v.status === 'APPROVED' || (v.reviewNote && v.reviewNote.trim().length > 0), {
    message: 'Vui lòng nhập lý do khi từ chối',
    path: ['reviewNote'],
  });

export default { createSupplierApplicationSchema, idParamSchema, listQuerySchema, reviewSchema };
