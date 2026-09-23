// src/middleware/auth.js
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AppError } from './errorHandler.js';

/**
 * Middleware: Verify JWT access token
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Unauthorized - Token missing'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.jwt.accessSecret);
    req.user = decoded; // { userId, roleCode }
    next();
  } catch (err) {
    return next(new AppError(401, 'Unauthorized - Invalid token'));
  }
}

/**
 * Middleware: Require specific roles
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.roleCode)) {
      return next(new AppError(403, 'Forbidden - Insufficient permissions'));
    }
    next();
  };
}
