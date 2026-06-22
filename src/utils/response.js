// src/utils/response.js

/**
 * Standard success response
 */
export function success(res, data, statusCode = 200, meta = null) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
}

/**
 * Paginated response
 */
export function paginated(res, data, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
