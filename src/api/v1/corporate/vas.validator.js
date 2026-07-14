// ENT-Day 2 — VAS request validators
import { z } from 'zod';

export const createVasSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_]+$/, 'code chỉ gồm chữ, số, underscore'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().min(1).max(60),
  basePrice: z.coerce.number().min(0),
  isActive: z.boolean().optional(),
  requiresHeadcount: z.boolean().optional(),
});

export const updateVasSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  unit: z.string().trim().min(1).max(60).optional(),
  basePrice: z.coerce.number().min(0).optional(),
  isActive: z.boolean().optional(),
  requiresHeadcount: z.boolean().optional(),
});

export const vasIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const corporateVasPricingSchema = z.object({
  prices: z
    .array(
      z.object({
        vasId: z.coerce.number().int().positive(),
        price: z.coerce.number().min(0),
        note: z.string().trim().max(1000).optional().nullable(),
      })
    )
    .min(1),
});

export const addBookingVasSchema = z.object({
  vasId: z.coerce.number().int().positive(),
  headcount: z.coerce.number().int().min(1, 'headcount phải >= 1').default(1),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const bookingVasParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  vasId: z.coerce.number().int().positive(), // bookingVAS line id
});

export const assignVasProviderSchema = z.object({
  providerId: z.coerce.number().int().positive().optional().nullable(),
});

export default {
  createVasSchema,
  updateVasSchema,
  vasIdParamSchema,
  corporateVasPricingSchema,
  addBookingVasSchema,
  bookingVasParamSchema,
  assignVasProviderSchema,
};
