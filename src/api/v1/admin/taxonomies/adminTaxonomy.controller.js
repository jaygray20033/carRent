// src/api/v1/admin/taxonomies/adminTaxonomy.controller.js
// Admin blog taxonomy controllers (UC-56) — post categories + tags.
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, created } from '../../../../utils/apiResponse.js';
import { adminCategoryService, adminTagService } from './adminTaxonomy.service.js';

// Build a controller quartet over a given taxonomy service.
const makeController = (service, key) => ({
  list: asyncHandler(async (_req, res) => {
    const items = await service.list();
    return success(res, { items });
  }),
  create: asyncHandler(async (req, res) => {
    const item = await service.create(req.body);
    return created(res, { [key]: item }, 'Đã tạo');
  }),
  update: asyncHandler(async (req, res) => {
    const item = await service.update(req.params.id, req.body);
    return success(res, { [key]: item }, 'Đã cập nhật');
  }),
  remove: asyncHandler(async (req, res) => {
    const result = await service.remove(req.params.id);
    return success(res, result, 'Đã xóa');
  }),
});

export const adminCategoryController = makeController(adminCategoryService, 'category');
export const adminTagController = makeController(adminTagService, 'tag');
