const Company = require('../models/Company');
const CompanySettings = require('../models/CompanySettings');
const ReportService = require('../services/report.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class CompanyController {
  /**
   * Get Dashboard metrics for Company Admin
   */
  static async getDashboard(req, res, next) {
    try {
      const metrics = await ReportService.getCompanyDashboardMetrics(req.tenantId);
      return ApiResponse.success(res, 'Dashboard metrics retrieved', metrics);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current company information
   */
  static async getCompanyProfile(req, res, next) {
    try {
      const company = await Company.findById(req.tenantId).populate('subscriptionId');
      if (!company) {
        throw ApiError.notFound('Company not found');
      }
      return ApiResponse.success(res, 'Company profile retrieved', company);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update company information (Self-Service Profile & Branding)
   */
  static async updateCompanyProfile(req, res, next) {
    try {
      const {
        name,
        phone,
        email,
        address,
        registrationNumber,
        taxNumber,
        supportPhone,
        supportEmail,
        receiptFooterNote,
        workingDays,
        logo,
      } = req.body;

      const updatePayload = {};
      if (name) updatePayload.name = name;
      if (phone) updatePayload.phone = phone;
      if (email) updatePayload.email = email;
      if (address) updatePayload.address = address;
      if (registrationNumber !== undefined) updatePayload.registrationNumber = registrationNumber;
      if (taxNumber !== undefined) updatePayload.taxNumber = taxNumber;
      if (supportPhone !== undefined) updatePayload.supportPhone = supportPhone;
      if (supportEmail !== undefined) updatePayload.supportEmail = supportEmail;
      if (receiptFooterNote !== undefined) updatePayload.receiptFooterNote = receiptFooterNote;
      if (workingDays) updatePayload.workingDays = workingDays;
      if (logo !== undefined) updatePayload.logo = logo;

      const company = await Company.findByIdAndUpdate(
        req.tenantId,
        updatePayload,
        { new: true }
      );

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'COMPANY_SETTINGS_UPDATED',
        module: 'SETTINGS',
        req,
      });

      return ApiResponse.success(res, 'Company profile updated successfully', company);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Company Settings
   */
  static async getSettings(req, res, next) {
    try {
      let settings = await CompanySettings.findOne({ companyId: req.tenantId });
      if (!settings) {
        settings = await CompanySettings.create({ companyId: req.tenantId });
      }
      return ApiResponse.success(res, 'Settings retrieved', settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Company Settings
   */
  static async updateSettings(req, res, next) {
    try {
      const { receiptSettings, financeSettings, notificationSettings } = req.body;
      const settings = await CompanySettings.findOneAndUpdate(
        { companyId: req.tenantId },
        { receiptSettings, financeSettings, notificationSettings },
        { new: true, upsert: true }
      );

      return ApiResponse.success(res, 'Settings updated successfully', settings);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CompanyController;
