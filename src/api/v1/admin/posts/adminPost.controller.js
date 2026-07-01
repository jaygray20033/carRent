// src/api/v1/admin/posts/adminPost.controller.js
// Admin blog CRUD controllers (UC-56).
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { adminPostService } from './adminPost.service.js';

export const adminPostController = {
  // GET /admin/posts?status=&q=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await adminPostService.list({
      status: req.query.status,
      q: req.query.q,
      page,
      size,
    });
    return paginated(res, result.items, {
      total: result.total,
      page: result.page,
      limit: result.size,
    });
  }),

  // GET /admin/posts/:id
  detail: asyncHandler(async (req, res) => {
    const post = await adminPostService.getById(req.params.id);
    return success(res, { post });
  }),

  // POST /admin/posts
  create: asyncHandler(async (req, res) => {
    const post = await adminPostService.create(req.user.id, req.body);
    return created(res, { post }, 'Bài viết đã được tạo');
  }),

  // PATCH /admin/posts/:id
  update: asyncHandler(async (req, res) => {
    const post = await adminPostService.update(req.params.id, req.body);
    return success(res, { post }, 'Bài viết đã được cập nhật');
  }),

  // DELETE /admin/posts/:id (soft delete → status=ARCHIVED)
  remove: asyncHandler(async (req, res) => {
    const post = await adminPostService.softDelete(req.params.id);
    return success(res, { post }, 'Bài viết đã được lưu trữ');
  }),
};

export default adminPostController;
