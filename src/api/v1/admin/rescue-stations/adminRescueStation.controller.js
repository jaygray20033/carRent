// src/api/v1/admin/rescue-stations/adminRescueStation.controller.js
// Day 37 (UC-31) — admin rescue station CRUD.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { adminRescueStationService } from './adminRescueStation.service.js';

// Empty-string optional fields → null before hitting the DB.
const normalize = (body) => {
  const out = { ...body };
  for (const k of ['city', 'district', 'phone', 'hours']) {
    if (out[k] === '') out[k] = null;
  }
  return out;
};

export const adminRescueStationController = {
  // GET /admin/rescue-stations?q=&isActive=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await adminRescueStationService.list({
      q: req.query.q,
      isActive: req.query.isActive,
      page,
      size,
    });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // GET /admin/rescue-stations/:id
  detail: asyncHandler(async (req, res) => {
    const station = await adminRescueStationService.getById(req.params.id);
    return success(res, { station });
  }),

  // POST /admin/rescue-stations
  create: asyncHandler(async (req, res) => {
    const station = await adminRescueStationService.create(normalize(req.body));
    return created(res, { station }, 'Đã tạo trạm cứu hộ');
  }),

  // PATCH /admin/rescue-stations/:id
  update: asyncHandler(async (req, res) => {
    const station = await adminRescueStationService.update(req.params.id, normalize(req.body));
    return success(res, { station }, 'Đã cập nhật trạm cứu hộ');
  }),

  // DELETE /admin/rescue-stations/:id
  remove: asyncHandler(async (req, res) => {
    const result = await adminRescueStationService.remove(req.params.id);
    return success(res, result, 'Đã xóa trạm cứu hộ');
  }),
};

export default adminRescueStationController;
