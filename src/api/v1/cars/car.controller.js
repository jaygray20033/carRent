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
