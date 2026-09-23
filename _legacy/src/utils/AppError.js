// src/utils/AppError.js — Compatibility re-export
// Some files call `new AppError(statusCode, message, details)` (statusCode first).
// This wrapper accepts both argument orders and delegates to the main apiError.
import { AppError as BaseAppError } from './apiError.js';

export class AppError extends BaseAppError {
  constructor(statusCodeOrMessage, messageOrStatusCode = 400, detailsOrCode = null) {
    // Detect order: if first arg is a number → (statusCode, message, details)
    if (typeof statusCodeOrMessage === 'number') {
      super(messageOrStatusCode, statusCodeOrMessage, null, detailsOrCode);
    } else {
      // (message, statusCode, code/details)
      super(statusCodeOrMessage, messageOrStatusCode, detailsOrCode);
    }
  }
}

export default AppError;
