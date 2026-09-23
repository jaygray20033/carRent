/**
 * Standard API response helpers
 */

function success(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function error(res, message = 'Error', statusCode = 400, errors = null) {
  const response = {
    success: false,
    message,
  };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

function created(res, data, message = 'Created successfully') {
  return success(res, data, message, 201);
}

module.exports = { success, error, created };
