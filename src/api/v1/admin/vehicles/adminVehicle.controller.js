// src/api/v1/admin/vehicles/adminVehicle.controller.js
import { adminVehicleService } from './adminVehicle.service.js';
import storage from '../../../../integrations/storage.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';
import { ValidationError } from '../../../../utils/apiError.js';

export const adminVehicleController = {
  // GET /admin/vehicles?status=&q=
  list: async (req, res) => {
    const result = await adminVehicleService.list(req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // GET /admin/vehicles/:id
  detail: async (req, res) => {
    const vehicle = await adminVehicleService.getById(req.params.id);
    return success(res, { vehicle });
  },

  // POST /admin/vehicles
  create: async (req, res) => {
    const vehicle = await adminVehicleService.create(req.body);
    return created(res, { vehicle }, 'Vehicle created');
  },

  // PATCH /admin/vehicles/:id
  update: async (req, res) => {
    const vehicle = await adminVehicleService.update(req.params.id, req.body);
    return success(res, { vehicle }, 'Vehicle updated');
  },

  // DELETE /admin/vehicles/:id  (soft delete → status=RETIRED)
  remove: async (req, res) => {
    const vehicle = await adminVehicleService.softDelete(req.params.id);
    return success(res, { vehicle }, 'Vehicle retired (soft deleted)');
  },

  // PATCH /admin/vehicles/:id/status  (quick action)
  updateStatus: async (req, res) => {
    const vehicle = await adminVehicleService.updateStatus(req.params.id, req.body.status);
    return success(res, { vehicle }, 'Vehicle status updated');
  },

  // GET /admin/vehicles/:id/bookings  (booking history of a vehicle)
  bookings: async (req, res) => {
    const result = await adminVehicleService.listBookings(req.params.id, req.query);
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  },

  // POST /admin/vehicles/:id/images  (multipart, <=10 files field "images")
  uploadImages: async (req, res) => {
    const files = req.files || [];
    if (!files.length) {
      throw new ValidationError([{ field: 'images', message: 'No image files uploaded' }]);
    }
    if (files.length > 10) {
      throw new ValidationError([{ field: 'images', message: 'Max 10 images per request' }]);
    }

    // Push every file to the configured storage (S3 or local).
    const uploaded = await storage.uploadMany(files, { folder: `vehicles/${req.params.id}` });

    const vehicle = await adminVehicleService.addImages(req.params.id, uploaded);
    return created(
      res,
      { vehicle, uploaded, driver: storage.driver },
      `${uploaded.length} image(s) uploaded`
    );
  },
};
