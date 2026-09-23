// src/api/v1/cars/car.controller.js
import { carService } from './car.service.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';

export const carController = {
  // GET /cars — UC-10 filter + UC-11 sort + pagination + cache
  list: async (req, res) => {
    const result = await carService.list(req.query);
    // Hint browser/proxy caches for 5 minutes as well
    res.set('Cache-Control', 'public, max-age=300');
    res.set('X-Cache', result.cached ? 'HIT' : 'MISS');
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // GET /cars/search?q= — auto-complete on models + brands + vehicles
  search: async (req, res) => {
    const { q, limit } = req.query;
    const result = await carService.autocomplete(q, limit ? Number(limit) : 8);
    res.set('Cache-Control', 'public, max-age=120');
    return success(res, result);
  },

  detail: async (req, res) => {
    const car = await carService.getById(req.params.id);
    return success(res, { car });
  },

  // GET /cars/:slug — detail by slug (images, rates, deposit, rating included)
  detailBySlug: async (req, res) => {
    const car = await carService.getBySlug(req.params.slug);
    res.set('Cache-Control', 'public, max-age=120');
    return success(res, { car });
  },

  // GET /cars/:id/availability?from=&to= — booked periods for the date picker
  availability: async (req, res) => {
    const periods = await carService.getAvailability(req.params.id, {
      from: req.query.from,
      to: req.query.to,
    });
    res.set('Cache-Control', 'public, max-age=60');
    return success(res, { periods });
  },

  // GET /cars/:id/similar — related cars (same category or brand)
  similar: async (req, res) => {
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 12) : 4;
    const cars = await carService.getSimilar(req.params.id, limit);
    res.set('Cache-Control', 'public, max-age=120');
    return success(res, { cars });
  },

  create: async (req, res) => {
    const car = await carService.create(req.body);
    return created(res, { car }, 'Car created');
  },

  update: async (req, res) => {
    const car = await carService.update(req.params.id, req.body);
    return success(res, { car }, 'Car updated');
  },

  delete: async (req, res) => {
    await carService.delete(req.params.id);
    return success(res, {}, 'Car deleted');
  },
};
