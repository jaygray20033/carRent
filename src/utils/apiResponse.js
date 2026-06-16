// src/utils/apiResponse.js
// Convert BigInt → string when serializing JSON
const serialize = (obj) =>
  JSON.parse(
    JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value))
  );

export const success = (res, data = {}, message = 'OK', status = 200) =>
  res.status(status).json({
    success: true,
    message,
    data: serialize(data),
    timestamp: new Date().toISOString(),
  });

export const created = (res, data, message = 'Created') => success(res, data, message, 201);

export const paginated = (res, items, meta) =>
  res.status(200).json({
    success: true,
    data: serialize(items),
    meta: {
      total: meta.total,
      page: meta.page,
      limit: meta.limit,
      totalPages: Math.ceil(meta.total / meta.limit),
    },
    timestamp: new Date().toISOString(),
  });

export const fail = (res, message = 'Error', status = 400, code = null, errors = null) =>
  res.status(status).json({
    success: false,
    message,
    code,
    errors,
    timestamp: new Date().toISOString(),
  });
