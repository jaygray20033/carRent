// src/api/v1/admin/coupons/adminCoupon.validator.js
// Admin coupon validation (UC-57).
import { z } from 'zod';

export const TYPES = ['FIXED', 'PERCENT', 'FREE_DRIVER'];
export const APPLIES_TO = ['ALL', 'CATEGORY', 'MODEL'];

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id must be a positive integer'),
});

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
});

// Shared field rules. Dates arrive as ISO strings and coerce to Date.
const baseFields = {
  code: z
    .string()
    .trim()
    .min(3, 'Mã tối thiểu 3 ký tự')
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, gạch ngang/dưới'),
  type: z.enum(TYPES),
  value: z.number().positive('Giá trị phải lớn hơn 0'),
  minOrder: z.number().min(0).optional(),
  maxDiscount: z.number().positive().nullish(),
  maxUse: z.number().int().min(0).optional(),
  maxUsePerUser: z.number().int().min(1).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  appliesTo: z.enum(APPLIES_TO).optional(),
  isActive: z.boolean().optional(),
};

// end_at > start_at, and PERCENT value must be ≤ 100.
const crossFieldChecks = (v, ctx) => {
  if (v.startAt && v.endAt && v.endAt <= v.startAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endAt'],
      message: 'Ngày kết thúc phải sau ngày bắt đầu',
    });
  }
  if (v.type === 'PERCENT' && v.value !== undefined && v.value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Giá trị phần trăm không được vượt quá 100',
    });
  }
};

export const createCouponSchema = z.object(baseFields).superRefine(crossFieldChecks);

// All fields optional on update; cross-field checks still apply when present.
export const updateCouponSchema = z
  .object(
    Object.fromEntries(
      Object.entries(baseFields).map(([k, schema]) => [k, schema.optional()])
    )
  )
  .superRefine(crossFieldChecks);

export default {
  idParamSchema,
  listQuerySchema,
  createCouponSchema,
  updateCouponSchema,
};
