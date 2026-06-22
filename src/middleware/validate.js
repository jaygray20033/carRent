// src/middleware/validate.js
import { AppError } from './errorHandler.js';

/**
 * Validate request using a Zod schema
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(new AppError(400, 'Validation failed', errors));
    }
    req[source] = result.data;
    next();
  };
}
