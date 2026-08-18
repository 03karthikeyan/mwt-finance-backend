const Company = require('../models/Company');
const User = require('../models/User');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const CompanySettings = require('../models/CompanySettings');
const FinanceAccount = require('../models/FinanceAccount');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const AuditLog = require('../models/AuditLog');
const PasswordUtil = require('../utils/passwordUtil');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');
const { ROLES } = require('../config/roles');
const { SubscriptionStatus } = require('../constants/enums');

class SuperAdminController {
  /**
   * Platform Analytics Dashboard
   */
  static async getPlatformDashboard(req, res, next) {
    try {
      const [
        totalCompanies,
        activeCompanies,
        totalUsers,
        totalCustomers,
        totalFinanceAccounts,
        totalPaymentsAgg,
        recentCompanies,
      ] = await Promise.all([
        Company.countDocuments(),
        Company.countDocuments({ status: 'ACTIVE' }),
        User.countDocuments(),
        Customer.countDocuments(),
        FinanceAccount.countDocuments(),
        Payment.aggregate([
          { $match: { status: 'SUCCESS' } },
          { $group: { _id: null, totalCollected: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        Company.find().sort({ createdAt: -1 }).limit(5),
      ]);

      const paymentStats = totalPaymentsAgg[0] || { totalCollected: 0, count: 0 };

      return ApiResponse.success(res, 'Platform metrics retrieved', {
        totalCompanies,
        activeCompanies,
        totalUsers,
        totalCustomers,
        totalFinanceAccounts,
        totalPlatformCollectionVolume: paymentStats.totalCollected,
        totalPlatformTransactions: paymentStats.count,
        recentCompanies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all Companies with search, filter, and pagination
   */
  static async getCompanies(req, res, next) {
    try {
      const { page = 1, limit = 10, search = '', status } = req.query;
      const query = {};

      if (status) query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { companyCode: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [companies, total] = await Promise.all([
        Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        Company.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Companies retrieved', companies, 200, {
        page,
        limit,
        total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new Company Tenant and its first Company Admin
   */
  static async createCompany(req, res, next) {
    try {
      const {
        name,
        companyCode,
        email,
        phone,
        adminName,
        adminPassword,
        currencyCode = 'INR',
        currencySymbol = '₹',
        address = {},
        subscriptionPlanId,
      } = req.body;

      // Check unique company code
      const existingCode = await Company.findOne({ companyCode: companyCode.toUpperCase() });
      if (existingCode) {
        throw ApiError.conflict(`Company code '${companyCode}' is already taken.`);
      }

      // Check unique admin email
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        throw ApiError.conflict(`A user with email '${email}' already exists.`);
      }

      // 1. Create Company
      const company = new Company({
        name,
        companyCode: companyCode.toUpperCase(),
        email: email.toLowerCase(),
        phone,
        address,
        currency: { code: currencyCode, symbol: currencySymbol },
        status: 'ACTIVE',
      });
      await company.save();

      // 2. Create Company Admin User
      const hashedPassword = await PasswordUtil.hash(adminPassword);
      const companyAdmin = new User({
        companyId: company._id,
        name: adminName,
        email: email.toLowerCase(),
        password: hashedPassword,
        phone,
        role: ROLES.COMPANY_ADMIN,
        status: 'ACTIVE',
      });
      await companyAdmin.save();

      // 3. Create Default Company Settings
      const companySettings = new CompanySettings({
        companyId: company._id,
      });
      await companySettings.save();

      // 4. Create Subscription (Trial or selected plan)
      let plan = null;
      if (subscriptionPlanId) {
        plan = await SubscriptionPlan.findById(subscriptionPlanId);
      }
      if (!plan) {
        plan = await SubscriptionPlan.findOne({ status: 'ACTIVE' });
      }

      if (plan) {
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + (plan.durationMonths || 1));

        const subscription = new Subscription({
          companyId: company._id,
          planId: plan._id,
          startDate: new Date(),
          expiryDate,
          status: SubscriptionStatus.ACTIVE,
          paymentStatus: 'PAID',
        });
        await subscription.save();

        company.subscriptionId = subscription._id;
        await company.save();
      }

      await AuditService.log({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'COMPANY_CREATED',
        module: 'COMPANIES',
        recordId: company._id.toString(),
        req,
        metadata: { companyName: company.name, companyCode: company.companyCode },
      });

      return ApiResponse.created(res, 'Company created successfully', {
        company,
        admin: {
          id: companyAdmin._id,
          name: companyAdmin.name,
          email: companyAdmin.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single company details with stats
   */
  static async getCompanyDetails(req, res, next) {
    try {
      const { id } = req.params;
      const company = await Company.findById(id).populate('subscriptionId');
      if (!company) {
        throw ApiError.notFound('Company not found');
      }

      const [adminUser, totalCustomers, totalAccounts, totalCollectedAgg] = await Promise.all([
        User.findOne({ companyId: company._id, role: ROLES.COMPANY_ADMIN }),
        Customer.countDocuments({ companyId: company._id }),
        FinanceAccount.countDocuments({ companyId: company._id }),
        Payment.aggregate([
          { $match: { companyId: company._id, status: 'SUCCESS' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const collectionStats = totalCollectedAgg[0] || { total: 0 };

      return ApiResponse.success(res, 'Company details retrieved', {
        company,
        admin: adminUser,
        stats: {
          totalCustomers,
          totalAccounts,
          totalCollected: collectionStats.total,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Company Status or details
   */
  static async updateCompany(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const company = await Company.findByIdAndUpdate(id, updates, { new: true });
      if (!company) {
        throw ApiError.notFound('Company not found');
      }

      await AuditService.log({
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'COMPANY_UPDATED',
        module: 'COMPANIES',
        recordId: company._id.toString(),
        req,
      });

      return ApiResponse.success(res, 'Company updated successfully', company);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Subscription Plans CRUD
   */
  static async getSubscriptionPlans(req, res, next) {
    try {
      const plans = await SubscriptionPlan.find().sort({ price: 1 });
      return ApiResponse.success(res, 'Subscription plans retrieved', plans);
    } catch (error) {
      next(error);
    }
  }

  static async createSubscriptionPlan(req, res, next) {
    try {
      const plan = new SubscriptionPlan(req.body);
      await plan.save();
      return ApiResponse.created(res, 'Subscription plan created', plan);
    } catch (error) {
      next(error);
    }
  }

  /**
   * System Audit Logs Viewer
   */
  static async getAuditLogs(req, res, next) {
    try {
      const { page = 1, limit = 20, module, action } = req.query;
      const query = {};
      if (module) query.module = module;
      if (action) query.action = action;

      const skip = (Number(page) - 1) * Number(limit);
      const [logs, total] = await Promise.all([
        AuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
        AuditLog.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Audit logs retrieved', logs, 200, { page, limit, total });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SuperAdminController;
