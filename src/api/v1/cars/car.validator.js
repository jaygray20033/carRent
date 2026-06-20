// src/api/v1/cars/car.validator.js
import { z } from 'zod';

// UC-10 filter + UC-11 sort query schema (§3)
export const listCarsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),

  // Free-text + filters
  q: z.string().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  brandId: z.coerce.number().int().optional(),
  categoryId: z.coerce.number().int().optional(),
  modelId: z.coerce.number().int().optional(),
  stationId: z.coerce.number().int().optional(),
  station_id: z.coerce.number().int().optional(),

  transmission: z.enum(['AUTO', 'MANUAL']).optional(),
  fuel: z.enum(['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC']).optional(),
  fuelType: z.enum(['GASOLINE', 'DIESEL', 'HYBRID', 'ELECTRIC']).optional(),
  featuredTag: z.string().optional(),

  // Seats range
  seats: z.coerce.number().int().optional(),
  seats_min: z.coerce.number().int().optional(),
  seats_max: z.coerce.number().int().optional(),

  // Price range
  price_min: z.coerce.number().optional(),
  price_max: z.coerce.number().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),

  status: z.enum(['AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED']).optional(),

  // UC-11
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popular', 'rating']).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().positive().max(20).optional(),
});

export const createCarSchema = z.object({
  brandId: z.number().int(),
  modelId: z.number().int().optional(),
  categoryId: z.number().int().optional(),
  stationId: z.number().int().optional(),
  depositAmount: z.number().nonnegative().optional(),
  name: z.string().min(2).max(200),
  slug: z.string().min(2).max(220),
  modelYear: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1),
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
