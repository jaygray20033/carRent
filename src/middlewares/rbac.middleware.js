// src/middlewares/rbac.middleware.js
import { ForbiddenError } from '../utils/apiError.js';

/** Resolve the user's role code regardless of flat (roleCode) or nested (role.code) shape. */
const roleCodeOf = (user) => user?.roleCode ?? user?.role?.code ?? null;

/**
 * Authorize the current user against a list of allowed roles.
 * @param  {...string} allowedRoles - e.g. authorize('ADMIN', 'OPERATOR')
 */
export const authorize =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    if (!allowedRoles.includes(roleCodeOf(req.user))) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };

/**
 * Day-8 RBAC helper — accepts an array of role codes.
 *
 * Usage:
 *   router.use(authenticate, requireRole(['ADMIN', 'OPERATOR']));
 *
 * @param {string[]} roles - allowed role codes (default ['ADMIN'])
 */
export const requireRole =
  (roles = ['ADMIN']) =>
  (req, _res, next) => {
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!req.user) return next(new ForbiddenError('Forbidden'));
    if (!allowed.includes(roleCodeOf(req.user))) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    next();
  };
