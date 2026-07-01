// src/api/v1/admin/coupons/adminCoupon.controller.js
// Admin coupon CRUD controllers (UC-57).
import { asyncHandler } from '../../../../middlewares/asyncHandler.js';
import { success, created, paginated } from '../../../../utils/apiResponse.js';
import { parsePagination } from '../../../../utils/pagination.js';
import { adminCouponService } from './adminCoupon.service.js';

export const adminCouponController = {
  // GET /admin/coupons?q=&isActive=&page=&size=
  list: asyncHandler(async (req, res) => {
    const { page, size } = parsePagination(req.query, 20);
    const result = await adminCouponService.list({
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

  // GET /admin/coupons/:id
  detail: asyncHandler(async (req, res) => {
    const coupon = await adminCouponService.getById(req.params.id);
    return success(res, { coupon });
  }),

  // POST /admin/coupons
  create: asyncHandler(async (req, res) => {
    const coupon = await adminCouponService.create(req.body);
    return created(res, { coupon }, 'Mã giảm giá đã được tạo');
  }),

  // PATCH /admin/coupons/:id
  update: asyncHandler(async (req, res) => {
    const coupon = await adminCouponService.update(req.params.id, req.body);
    return success(res, { coupon }, 'Mã giảm giá đã được cập nhật');
  }),

  // DELETE /admin/coupons/:id
  remove: asyncHandler(async (req, res) => {
    const result = await adminCouponService.remove(req.params.id);
    return success(res, result, 'Mã giảm giá đã được xóa');
  }),
};

export default adminCouponController;
