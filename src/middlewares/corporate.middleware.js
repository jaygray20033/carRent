// src/middlewares/corporate.middleware.js
// B2B Day 2 — requireCorporateEmployee / requireCorporateAdmin.
import prisma from '../config/db.js';
import { ForbiddenError } from '../utils/apiError.js';

/**
 * Load the caller's active CorporateEmployee membership onto the request.
 * Sets req.corporateEmployee and req.corporate.
 */
async function loadMembership(userId) {
  return prisma.corporateEmployee.findFirst({
    where: { userId: Number(userId), isActive: true },
    include: {
      corporate: true,
      user: { select: { id: true, fullName: true, phone: true, email: true } },
    },
  });
}

/** Any active corporate employee may proceed. */
export const requireCorporateEmployee = async (req, _res, next) => {
  try {
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    const membership = await loadMembership(req.user.id);
    if (!membership) {
      return next(new ForbiddenError('Bạn không thuộc công ty nào'));
    }
    if (!membership.corporate?.isActive) {
      return next(new ForbiddenError('Công ty đang tạm ngưng hoạt động'));
    }
    req.corporateEmployee = membership;
    req.corporate = membership.corporate;
    return next();
  } catch (err) {
    return next(err);
  }
};

/** Active corporate employee AND isAdmin === true. */
export const requireCorporateAdmin = async (req, _res, next) => {
  try {
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    const membership = await loadMembership(req.user.id);
    if (!membership) {
      return next(new ForbiddenError('Bạn không thuộc công ty nào'));
    }
    if (!membership.corporate?.isActive) {
      return next(new ForbiddenError('Công ty đang tạm ngưng hoạt động'));
    }
    if (!membership.isAdmin) {
      return next(new ForbiddenError('Chỉ Corporate Admin mới được thực hiện thao tác này'));
    }
    req.corporateEmployee = membership;
    req.corporate = membership.corporate;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default { requireCorporateEmployee, requireCorporateAdmin };
