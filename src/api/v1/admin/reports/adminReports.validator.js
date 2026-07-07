// src/api/v1/admin/reports/adminReports.validator.js
// Day 35 (UC-59) — query validation for the report endpoints.
import { z } from 'zod';

const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

const endAfterStart = (v, ctx) => {
  if (v.from && v.to && v.to < v.from) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    });
  }
};

export const revenueQuerySchema = z
  .object({
    ...dateRange,
    group: z.enum(['day', 'month']).optional().default('day'),
    format: z.enum(['csv', 'excel', 'pdf']).optional(),
  })
  .superRefine(endAfterStart);

export const bookingQuerySchema = z.object({ ...dateRange }).superRefine(endAfterStart);

export const topVehiclesQuerySchema = z
  .object({
    ...dateRange,
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  })
  .superRefine(endAfterStart);

export default { revenueQuerySchema, bookingQuerySchema, topVehiclesQuerySchema };
