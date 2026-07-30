const { error } = require('../utils/response');

function errorHandler(err, req, res, _next) {
  console.error('[Error]', err);

  // Sequelize validation errors
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const messages = err.errors.map((e) => e.message);
    return error(res, 'Validation error', 422, messages);
  }

  // HTTP errors (from http-errors)
  if (err.statusCode) {
    return error(res, err.message, err.statusCode);
  }

  // Default 500
  return error(res, 'Internal server error', 500);
}

module.exports = errorHandler;
