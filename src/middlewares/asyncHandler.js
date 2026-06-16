// src/middlewares/asyncHandler.js
// Wrap async controller → forward exception to errorHandler
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
