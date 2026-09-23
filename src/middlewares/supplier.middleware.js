// Marketplace — requireSupplierMember / requireSupplierAdmin.
// Mirrors corporate.middleware.js: loads the caller's active SupplierMember
// membership onto the request as req.supplierMembership / req.supplier.
import prisma from '../config/db.js';
import { ForbiddenError } from '../utils/apiError.js';

/** Load the caller's active SupplierMember membership (one supplier per user). */
async function loadMembership(userId) {
  return prisma.supplierMember.findFirst({
    where: { userId: Number(userId), isActive: true },
    include: {
      supplier: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });
}

/** Any active supplier member (admin or driver) may proceed. */
export const requireSupplierMember = async (req, _res, next) => {
  try {
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    const membership = await loadMembership(req.user.id);
    if (!membership) {
      return next(new ForbiddenError('Bạn không thuộc nhà cung cấp nào'));
    }
    if (!membership.supplier?.isActive) {
      return next(new ForbiddenError('Nhà cung cấp đang tạm ngưng hoạt động'));
    }
    req.supplierMembership = membership;
    req.supplier = membership.supplier;
    return next();
  } catch (err) {
    return next(err);
  }
};

/** Active supplier member AND isAdmin === true. */
export const requireSupplierAdmin = async (req, _res, next) => {
  try {
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    const membership = await loadMembership(req.user.id);
    if (!membership) {
      return next(new ForbiddenError('Bạn không thuộc nhà cung cấp nào'));
    }
    if (!membership.supplier?.isActive) {
      return next(new ForbiddenError('Nhà cung cấp đang tạm ngưng hoạt động'));
    }
    if (!membership.isAdmin) {
      return next(new ForbiddenError('Chỉ Supplier Admin mới được thực hiện thao tác này'));
    }
    req.supplierMembership = membership;
    req.supplier = membership.supplier;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default { requireSupplierMember, requireSupplierAdmin };
