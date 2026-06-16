// src/middlewares/validate.middleware.js
import { ValidationError } from '../utils/apiError.js';

/**
 * Zod validator wrapper.
 * @param {ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return next(new ValidationError(details));
  }
  req[source] = result.data;
  next();
};
