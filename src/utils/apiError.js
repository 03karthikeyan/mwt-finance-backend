class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message, errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized access') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden: You do not have permission to perform this action') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }

  static unprocessable(message = 'Validation failed', errors = []) {
    return new ApiError(422, message, errors);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
