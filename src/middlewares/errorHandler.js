// ─────────────────────────────────────────────────────────────────────
//  src/middlewares/errorHandler.js — Global error handler
// ─────────────────────────────────────────────────────────────────────
import env from '../config/env.js';

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  // Log non-operational errors
  if (!err.isOperational) {
    console.error('[ERROR]', err);
  }

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export default errorHandler;
