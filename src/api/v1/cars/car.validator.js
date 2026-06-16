// src/api/v1/cars/car.validator.js
import { z } from 'zod';

export const listCarsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  brandId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  stationId: z.coerce.number().int().optional(),
  transmission: z.enum(['AUTO', 'MANUAL']).optional(),
  fuelType: z.enum(['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC']).optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
  status: z.enum(['AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED']).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'rating']).optional(),
});

export const createCarSchema = z.object({
  brandId: z.number().int(),
  categoryId: z.number().int(),
  stationId: z.number().int().optional(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(220),
  modelYear: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  licensePlate: z.string().min(4).max(20),
  color: z.string().optional(),
  seats: z.number().int().min(2).max(50).optional(),
  transmission: z.enum(['AUTO', 'MANUAL']).optional(),
  fuelType: z.enum(['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC']).optional(),
  pricePerDay: z.number().positive(),
  description: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
});

export const updateCarSchema = createCarSchema.partial();
