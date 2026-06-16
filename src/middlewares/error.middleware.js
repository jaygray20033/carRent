// src/middlewares/error.middleware.js
import logger from '../config/logger.js';
import { AppError } from '../utils/apiError.js';
import { fail } from '../utils/apiResponse.js';
import { isProd } from '../config/env.js';

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return fail(res, err.message, err.statusCode, err.code, err.details);
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return fail(res, 'Duplicated value', 409, 'DUPLICATE', { fields: err.meta?.target });
  }
  if (err.code === 'P2025') {
    return fail(res, 'Record not found', 404, 'NOT_FOUND');
  }

  logger.error(err);
  return fail(
    res,
    isProd ? 'Internal server error' : err.message,
    500,
    'INTERNAL',
    isProd ? null : { stack: err.stack }
  );
};

export const notFound = (req, res) =>
  fail(res, `Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND');
