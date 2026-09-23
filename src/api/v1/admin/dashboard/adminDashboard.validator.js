// src/api/v1/admin/dashboard/adminDashboard.validator.js
// Admin dashboard KPI query validation (UC-52).
import { z } from 'zod';

// from/to are optional ISO date strings; service defaults to the last 30 days.
// end >= start is enforced cross-field.
export const dashboardQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.from && v.to && v.to < v.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
      });
    }
  });

export default { dashboardQuerySchema };
