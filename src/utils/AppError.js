// ─────────────────────────────────────────────────────────────────────
//  src/utils/AppError.js — Custom application error class
// ─────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
