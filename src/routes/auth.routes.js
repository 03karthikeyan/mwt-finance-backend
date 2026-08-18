const express = require('express');
const AuthController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/auth.middleware');
const validate = require('../middlewares/validate.middleware');
const { authLimiter } = require('../middlewares/rateLimiter');
const {
  loginSchema,
  changePasswordSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');

const router = express.Router();

router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', validate(refreshTokenSchema), AuthController.refreshToken);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/verify-reset-otp', authLimiter, validate(verifyResetOtpSchema), AuthController.verifyResetOtp);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), AuthController.resetPassword);
router.post('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);
router.get('/profile', authenticate, AuthController.getProfile);

module.exports = router;
