const environment = require('../config/environment');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. It must be unique.`;
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for resource identifier: ${err.value}`;
  }

  // Log error
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[${req.method}] ${req.originalUrl} - Status ${statusCode}: ${message}`);
  }

  // Hide internal errors in production
  if (environment.env === 'production' && statusCode === 500) {
    message = 'An internal server error occurred. Please contact support.';
  }

  return ApiResponse.error(res, message, statusCode, errors);
};

module.exports = errorHandler;
