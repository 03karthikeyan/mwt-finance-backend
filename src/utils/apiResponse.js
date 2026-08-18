/**
 * Standard API Response Structure for Finance SaaS
 * Formats:
 * {
 *   success: true,
 *   message: "...",
 *   data: { ... },
 *   pagination: { page, limit, total, totalPages, hasNext, hasPrevious }
 * }
 */
class ApiResponse {
  static success(res, message = 'Operation successful', data = null, statusCode = 200, pagination = null) {
    const response = {
      success: true,
      message,
      data: data !== null ? data : undefined,
    };

    if (pagination) {
      response.pagination = {
        page: Number(pagination.page) || 1,
        limit: Number(pagination.limit) || 10,
        total: Number(pagination.total) || 0,
        totalPages: Math.ceil((pagination.total || 0) / (pagination.limit || 10)),
        hasNext: (pagination.page * pagination.limit) < pagination.total,
        hasPrevious: pagination.page > 1,
      };
    }

    return res.status(statusCode).json(response);
  }

  static created(res, message = 'Resource created successfully', data = null) {
    return ApiResponse.success(res, message, data, 201);
  }

  static error(res, message = 'An error occurred', statusCode = 500, errors = []) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
    });
  }
}

module.exports = ApiResponse;
