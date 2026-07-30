// src/utils/apiError.js
export class AppError extends Error {
  constructor(message, statusCode = 400, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') {
    super(msg, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(msg = 'Forbidden') {
    super(msg, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(msg = 'Conflict', code = 'CONFLICT') {
    super(msg, 409, code);
  }
}

export class ValidationError extends AppError {
  constructor(details) {
    super('Validation failed', 422, 'VALIDATION', details);
  }
}

// 410 — resource expired/gone (e.g. OTP expired)
export class GoneError extends AppError {
  constructor(msg = 'Gone', code = 'GONE') {
    super(msg, 410, code);
  }
}

// 422 — business-rule validation with explicit code (e.g. OTP_INVALID)
export class UnprocessableError extends AppError {
  constructor(msg = 'Unprocessable', code = 'UNPROCESSABLE', details = null) {
    super(msg, 422, code, details);
  }
}

// 429 — too many requests (rate limit)
export class TooManyRequestsError extends AppError {
  constructor(msg = 'Too many requests', code = 'TOO_MANY_REQUESTS') {
    super(msg, 429, code);
  }
}
