// src/api/v1/admin/vehicle-models/adminVehicleModel.controller.js
import { adminVehicleModelService } from './adminVehicleModel.service.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';

export const adminVehicleModelController = {
  // GET /admin/vehicle-models
  list: async (req, res) => {
    const result = await adminVehicleModelService.list(req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // GET /admin/vehicle-models/:id
  detail: async (req, res) => {
    const model = await adminVehicleModelService.getById(req.params.id);
    return success(res, { model });
  },

  // POST /admin/vehicle-models
  create: async (req, res) => {
    const model = await adminVehicleModelService.create(req.body);
    return created(res, { model }, 'Vehicle model created');
  },

  // PATCH /admin/vehicle-models/:id
  update: async (req, res) => {
    const model = await adminVehicleModelService.update(req.params.id, req.body);
    return success(res, { model }, 'Vehicle model updated');
  },

  // DELETE /admin/vehicle-models/:id
  remove: async (req, res) => {
    const result = await adminVehicleModelService.remove(req.params.id);
    return success(res, result, 'Vehicle model deleted');
  },
};
