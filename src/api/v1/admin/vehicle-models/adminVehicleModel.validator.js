// src/api/v1/admin/vehicle-models/adminVehicleModel.validator.js
import { z } from 'zod';

const TRANSMISSION = ['AUTO', 'MANUAL'];
const FUEL = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'];

export const adminListModelsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  size: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().optional(),
  brandId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
});

export const createModelSchema = z.object({
  brandId: z.number().int(),
  categoryId: z.number().int().optional(),
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  seats: z.number().int().min(2).max(50).optional(),
  transmission: z.enum(TRANSMISSION).optional(),
  fuelType: z.enum(FUEL).optional(),
  description: z.string().optional(),
});

export const updateModelSchema = createModelSchema.partial();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
