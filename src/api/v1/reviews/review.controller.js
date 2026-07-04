// src/api/v1/reviews/review.controller.js
import { reviewService } from './review.service.js';
import { createReviewSchema, listReviewsQuerySchema } from './review.validator.js';
import { ValidationError } from '../../../utils/apiError.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';

const toFieldErrors = (zodError) =>
  zodError.errors.map((e) => ({ field: e.path.join('.'), message: e.message }));

const parseId = (raw) => {
  const id = Number.parseInt(raw, 10);
  if (Number.isNaN(id)) throw new ValidationError([{ field: 'id', message: 'Invalid id' }]);
  return id;
};

export const reviewController = {
  // POST /bookings/:id/review
  create: async (req, res) => {
    const bookingId = parseId(req.params.id);
    const parsed = createReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));

    const review = await reviewService.create(req.user.id, bookingId, parsed.data);
    return created(res, { review }, 'Review submitted');
  },

  // GET /cars/:id/reviews
  listByVehicle: async (req, res) => {
    const vehicleId = parseId(req.params.id);
    const parsed = listReviewsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));
    const page = parsed.data.page ?? 1;
    const limit = parsed.data.limit ?? 10;

    const result = await reviewService.listByVehicle(vehicleId, { page, limit });
    return paginated(res, result.items, { total: result.total, page, limit });
  },

  // GET /me/reviews
  listMine: async (req, res) => {
    const parsed = listReviewsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(toFieldErrors(parsed.error));
    const page = parsed.data.page ?? 1;
    const limit = parsed.data.limit ?? 10;

    const result = await reviewService.listMine(req.user.id, { page, limit });
    return paginated(res, result.items, { total: result.total, page, limit });
  },

  // GET /me/reviews/reviewable
  reviewable: async (req, res) => {
    const bookings = await reviewService.reviewableBookings(req.user.id);
    return success(res, { bookings });
  },
};

export default reviewController;
