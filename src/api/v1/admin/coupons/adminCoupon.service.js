// src/api/v1/admin/coupons/adminCoupon.service.js
// Admin coupon CRUD (UC-57).
//   list       — all coupons, filter by q (code) / isActive, newest first, + usage count
//   getById    — single coupon incl. usage count
//   create     — code is uppercased & unique, dates validated by validator
//   update     — partial; re-checks code uniqueness when code changes
//   remove     — hard delete, blocked when the coupon has already been used
import prisma from '../../../../config/db.js';
import { NotFoundError, ConflictError } from '../../../../utils/apiError.js';

const withUsage = (coupon) =>
  coupon ? { ...coupon, usageCount: coupon._count?.usages ?? 0, _count: undefined } : coupon;

export const adminCouponService = {
  /** UC-57 — admin list, filter by code substring / active flag. */
  async list({ q, isActive, page = 1, size = 20 }) {
    const where = {};
    if (q && q.trim()) where.code = { contains: q.trim().toUpperCase() };
    if (isActive !== undefined) where.isActive = isActive;

    const [rows, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        include: { _count: { select: { usages: true } } },
      }),
      prisma.coupon.count({ where }),
    ]);

    return { items: rows.map(withUsage), total, page, size };
  },

  async getById(id) {
    const coupon = await prisma.coupon.findUnique({
      where: { id: Number(id) },
      include: { _count: { select: { usages: true } } },
    });
    if (!coupon) throw new NotFoundError('Coupon');
    return withUsage(coupon);
  },

  /** UC-57 — create. Code is normalised to uppercase and must be unique. */
  async create(data) {
    const code = data.code.trim().toUpperCase();
    await this._assertCodeFree(code);

    const coupon = await prisma.coupon.create({
      data: { ...data, code },
      include: { _count: { select: { usages: true } } },
    });
    return withUsage(coupon);
  },

  /** UC-57 — partial update. Re-checks code uniqueness only when it changes. */
  async update(id, data) {
    const existing = await prisma.coupon.findUnique({ where: { id: Number(id) } });
    if (!existing) throw new NotFoundError('Coupon');

    const patch = { ...data };
    if (patch.code !== undefined) {
      patch.code = patch.code.trim().toUpperCase();
      if (patch.code !== existing.code) await this._assertCodeFree(patch.code);
    }

    const coupon = await prisma.coupon.update({
      where: { id: Number(id) },
      data: patch,
      include: { _count: { select: { usages: true } } },
    });
    return withUsage(coupon);
  },

  /**
   * UC-57 — delete. A coupon that has already been redeemed is kept for audit;
   * callers should deactivate it (isActive=false) instead. Only unused coupons
   * can be hard-deleted.
   */
  async remove(id) {
    const existing = await prisma.coupon.findUnique({
      where: { id: Number(id) },
      include: { _count: { select: { usages: true } } },
    });
    if (!existing) throw new NotFoundError('Coupon');
    if (existing._count.usages > 0) {
      throw new ConflictError(
        'Không thể xóa mã đã được sử dụng. Hãy vô hiệu hóa (tắt trạng thái) thay vì xóa.',
        'COUPON_IN_USE'
      );
    }
    await prisma.coupon.delete({ where: { id: Number(id) } });
    return { id: Number(id) };
  },

  async _assertCodeFree(code) {
    const clash = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (clash) throw new ConflictError('Mã giảm giá đã tồn tại', 'DUPLICATE');
  },
};

export default adminCouponService;
