// src/api/v1/reviews/review.validator.js
import { z } from 'zod';

// POST /bookings/:id/review — rating 1-5, optional content + photos[]
export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  content: z.string().max(2000).optional(),
  photos: z.array(z.string().url()).max(10).optional(),
});

// GET /cars/:id/reviews?page=&limit=
export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
