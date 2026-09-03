const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse');
const AuditService = require('../services/audit.service');

class AuthController {
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);

      await AuditService.log({
        companyId: result.user.companyId,
        userId: result.user.id,
        userName: result.user.name,
        userRole: result.user.role,
        action: 'USER_LOGIN',
        module: 'AUTHENTICATION',
        req,
      });

      return ApiResponse.success(res, 'Login successful', result);
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshAccessToken(refreshToken);
      return ApiResponse.success(res, 'Token refreshed successfully', result);
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      const result = await AuthService.changePassword(
        req.user.id,
        req.user.role,
        oldPassword,
        newPassword
      );

      await AuditService.log({
        companyId: req.user.companyId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PASSWORD_CHANGE',
        module: 'AUTHENTICATION',
        req,
      });

      return ApiResponse.success(res, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { emailOrPhone } = req.body;
      const result = await AuthService.forgotPassword(emailOrPhone);
      return ApiResponse.success(res, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  static async verifyResetOtp(req, res, next) {
    try {
      const { emailOrPhone, otp } = req.body;
      const result = await AuthService.verifyResetOtp(emailOrPhone, otp);
      return ApiResponse.success(res, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { emailOrPhone, resetToken, newPassword } = req.body;
      const result = await AuthService.resetPassword(emailOrPhone, resetToken, newPassword);
      return ApiResponse.success(res, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req, res, next) {
    try {
      const Company = require('../models/Company');
      let company = null;
      if (req.user.companyId) {
        company = await Company.findById(req.user.companyId).select('name companyCode currency logo');
      }

      return ApiResponse.success(res, 'Profile retrieved', {
        ...req.user,
        company: company ? {
          id: company._id,
          name: company.name,
          companyCode: company.companyCode,
          currency: company.currency,
          logo: company.logo,
        } : null,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setMpin(req, res, next) {
    try {
      const { mpin } = req.body;
      const result = await AuthService.setMpin(req.user.id, mpin);
      return ApiResponse.success(res, result.message);
    } catch (error) {
      next(error);
    }
  }

  static async loginWithMpin(req, res, next) {
    try {
      const { phone, mpin } = req.body;
      const result = await AuthService.loginWithMpin(phone, mpin);
      return ApiResponse.success(res, 'MPIN Login successful', result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
