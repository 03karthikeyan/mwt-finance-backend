const jwt = require('jsonwebtoken');
const environment = require('../config/environment');

class JwtUtil {
  static generateAccessToken(payload) {
    return jwt.sign(payload, environment.jwtSecret, {
      expiresIn: environment.jwtExpiresIn,
    });
  }

  static generateRefreshToken(payload) {
    return jwt.sign(payload, environment.jwtRefreshSecret, {
      expiresIn: environment.jwtRefreshExpiresIn,
    });
  }

  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, environment.jwtSecret);
    } catch (err) {
      return null;
    }
  }

  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, environment.jwtRefreshSecret);
    } catch (err) {
      return null;
    }
  }
}

module.exports = JwtUtil;
