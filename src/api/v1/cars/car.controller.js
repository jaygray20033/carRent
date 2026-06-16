// src/api/v1/cars/car.controller.js
import { carService } from './car.service.js';
import { success, created, paginated } from '../../../utils/apiResponse.js';

export const carController = {
  list: async (req, res) => {
    const result = await carService.list(req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
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
