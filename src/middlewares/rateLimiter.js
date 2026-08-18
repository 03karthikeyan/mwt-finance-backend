const rateLimit = require('express-rate-limit');
const environment = require('../config/environment');
const ApiResponse = require('../utils/apiResponse');

const apiLimiter = rateLimit({
  windowMs: environment.rateLimit.windowMs,
  max: environment.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many requests from this IP. Please try again later.', 429);
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 30, // 30 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many login attempts. Please try again in 15 minutes.', 429);
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
