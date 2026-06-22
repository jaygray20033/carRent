// src/api/v1/admin/vehicles/adminVehicle.validator.js
import { z } from 'zod';

const TRANSMISSION = ['AUTO', 'MANUAL'];
const FUEL = ['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC'];
const STATUS = ['AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED'];

// Admin list query — allows filtering by any status (incl. non-AVAILABLE).
export const adminListVehiclesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  q: z.string().optional(),
  status: z.enum(STATUS).optional(),
  brandId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  stationId: z.coerce.number().int().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popular', 'rating']).optional(),
});

// Image payload accepted alongside vehicle create (JSON URLs).
const imageSchema = z.object({
  url: z.string().url(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createVehicleSchema = z.object({
  brandId: z.number().int(),
  modelId: z.number().int().optional(),
  categoryId: z.number().int().optional(),
  stationId: z.number().int().optional(),
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case'),
  modelYear: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1),
  licensePlate: z.string().min(4).max(20),
  color: z.string().optional(),
  seats: z.number().int().min(2).max(50).optional(),
  transmission: z.enum(TRANSMISSION).optional(),
  fuelType: z.enum(FUEL).optional(),
  pricePerDay: z.number().positive(),
  pricePerMonth: z.number().positive().optional(),
  depositAmount: z.number().nonnegative().optional(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  status: z.enum(STATUS).optional(),
  isFeatured: z.boolean().optional(),
  featuredTag: z.string().optional(),
  images: z.array(imageSchema).max(10).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
