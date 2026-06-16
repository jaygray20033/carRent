// src/middlewares/rbac.middleware.js
import { ForbiddenError } from '../utils/apiError.js';

/**
 * @param  {...string} allowedRoles - e.g. authorize('ADMIN', 'OPERATOR')
 */
export const authorize = (...allowedRoles) => (req, _res, next) => {
  if (!req.user) return next(new ForbiddenError('Forbidden'));
  if (!allowedRoles.includes(req.user.roleCode)) {
    return next(new ForbiddenError('Insufficient permissions'));
  }
  next();
};
