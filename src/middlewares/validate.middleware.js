const ApiError = require('../utils/apiError');

/**
 * Validates request payload against Joi schema
 * schemaObj can contain { body, query, params }
 */
const validate = (schemaObj) => {
  return (req, res, next) => {
    const keys = Object.keys(schemaObj);
    
    for (const key of keys) {
      if (schemaObj[key]) {
        const { error, value } = schemaObj[key].validate(req[key], {
          abortEarly: false,
          stripUnknown: true,
        });

        if (error) {
          const errors = error.details.map((detail) => ({
            field: detail.path.join('.'),
            message: detail.message.replace(/['"]/g, ''),
          }));
          return next(ApiError.unprocessable('Validation Error', errors));
        }

        // Replace req[key] with validated/sanitized value
        req[key] = value;
      }
    }

    next();
  };
};

module.exports = validate;
