const FinanceAccount = require('../models/FinanceAccount');
const FinanceProduct = require('../models/FinanceProduct');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const Installment = require('../models/Installment');
const FinanceCalculatorService = require('../services/financeCalculator.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');
const PushNotificationService = require('../services/pushNotification.service');
const { FinanceStatus } = require('../constants/enums');

class FinanceAccountController {
  /**
   * List Finance Accounts with pagination, filters & search
   */
  static async getAccounts(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        search = '',
        status,
        frequency,
        agentId,
        customerId,
        branchId,
      } = req.query;

      const query = { companyId: req.tenantId };
      if (status) query.status = status;
      if (frequency) query.frequency = frequency;
      if (branchId) query.branchId = branchId;
      if (agentId) query.agentId = agentId;
      if (customerId) query.customerId = customerId;

      if (search) {
        query.accountNumber = { $regex: search, $options: 'i' };
      }

      // If Field Agent, only show accounts assigned to this agent and their branch
      if (req.user.role === 'AGENT') {
        const agentProfile = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        if (agentProfile) {
          query.agentId = agentProfile._id;
          if (agentProfile.branchId) {
            query.branchId = agentProfile.branchId;
          }
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [accounts, total] = await Promise.all([
        FinanceAccount.find(query)
          .populate('customerId', 'name customerCode phone address')
          .populate('agentId')
          .populate('productId', 'name frequency calculationType')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        FinanceAccount.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Finance accounts retrieved', accounts, 200, {
        page,
        limit,
        total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview Calculation before Disbursement ("Giving" Preview)
   */
  static async previewDisbursement(req, res, next) {
    try {
      const {
        productId,
        principalAmount,
        customInstallments,
        customInterestPercentage,
        customDocChargePercentage,
        customDocChargeFixed,
        startDate,
        excludeSundays,
      } = req.body;

      const product = await FinanceProduct.findOne({ _id: productId, companyId: req.tenantId });
      if (!product) {
        throw ApiError.notFound('Finance product not found');
      }

      const calculation = FinanceCalculatorService.calculateFinance({
        principalAmount,
        product,
        frequency: product.frequency,
        customInstallments,
        customInterestPercentage,
        customDocChargePercentage,
        customDocChargeFixed,
        startDate: startDate ? new Date(startDate) : new Date(),
        excludeSundays: !!excludeSundays,
      });

      return ApiResponse.success(res, 'Calculation preview generated', calculation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Disburse Finance Loan ("Giving" - Create Account & Schedule)
   */
  static async disburseLoan(req, res, next) {
    try {
      const {
        customerId,
        productId,
        agentId,
        branchId,
        principalAmount,
        customInstallments,
        customInterestPercentage,
        customDocChargePercentage,
        customDocChargeFixed,
        startDate = new Date(),
        excludeSundays = false,
        notes = '',
      } = req.body;

      // 1. Verify Customer
      const customer = await Customer.findOne({ _id: customerId, companyId: req.tenantId });
      if (!customer) {
        throw ApiError.notFound('Customer not found in this company');
      }
      if (customer.status !== 'ACTIVE') {
        throw ApiError.badRequest(`Cannot disburse loan to a customer with status '${customer.status}'`);
      }

      // 2. Verify Product
      const product = await FinanceProduct.findOne({ _id: productId, companyId: req.tenantId });
      if (!product || product.status !== 'ACTIVE') {
        throw ApiError.notFound('Active finance product not found');
      }

      // 3. Verify or Assign Agent
      let selectedAgentId = agentId || customer.assignedAgentId;
      if (!selectedAgentId && req.user.role === 'AGENT') {
        const myAgent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        if (myAgent) selectedAgentId = myAgent._id;
      }
      if (!selectedAgentId) {
        const defaultAgent = await Agent.findOne({ companyId: req.tenantId, status: 'ACTIVE' });
        if (defaultAgent) selectedAgentId = defaultAgent._id;
      }

      if (!selectedAgentId) {
        throw ApiError.badRequest('Please select an agent to assign this finance account');
      }

      // 4. Calculate Financial Schedule
      const calc = FinanceCalculatorService.calculateFinance({
        principalAmount,
        product,
        frequency: product.frequency,
        customInstallments,
        customInterestPercentage,
        customDocChargePercentage,
        customDocChargeFixed,
        startDate,
        excludeSundays,
      });

      // 5. Generate Account Number (e.g. FIN-2026-00001)
      const count = await FinanceAccount.countDocuments({ companyId: req.tenantId });
      const year = new Date().getFullYear();
      const accountNumber = `FIN-${year}-${(count + 1).toString().padStart(5, '0')}`;

      // 6. Create Finance Account
      const account = new FinanceAccount({
        companyId: req.tenantId,
        branchId: branchId || customer.branchId || null,
        accountNumber,
        customerId: customer._id,
        agentId: selectedAgentId,
        productId: product._id,
        frequency: calc.frequency,
        principalAmount: calc.principalAmount,
        interestAmount: calc.interestAmount,
        docChargeAmount: calc.docChargeAmount,
        netDisbursedAmount: calc.netDisbursedAmount,
        totalPayableAmount: calc.totalPayableAmount,
        installmentAmount: calc.installmentAmount,
        totalInstallments: calc.totalInstallments,
        paidInstallments: 0,
        totalPaidAmount: 0,
        remainingAmount: calc.totalPayableAmount,
        startDate: calc.startDate,
        endDate: calc.endDate,
        nextDueDate: calc.nextDueDate,
        status: FinanceStatus.ACTIVE,
        disbursedBy: req.user.id,
        notes,
      });
      await account.save();

      // 7. Save Installment Schedule
      const installmentDocs = calc.schedule.map((s) => ({
        ...s,
        companyId: req.tenantId,
        financeAccountId: account._id,
        customerId: customer._id,
      }));
      await Installment.insertMany(installmentDocs);

      // 8. Update Customer Totals
      customer.totalActiveLoans = (customer.totalActiveLoans || 0) + 1;
      customer.totalOutstandingAmount = (customer.totalOutstandingAmount || 0) + calc.totalPayableAmount;
      if (!customer.assignedAgentId && selectedAgentId) {
        customer.assignedAgentId = selectedAgentId;
      }
      await customer.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'LOAN_DISBURSED',
        module: 'FINANCE_ACCOUNTS',
        recordId: account._id.toString(),
        req,
        metadata: {
          accountNumber,
          customerName: customer.name,
          principalAmount: calc.principalAmount,
          netDisbursedAmount: calc.netDisbursedAmount,
          totalPayableAmount: calc.totalPayableAmount,
        },
      });

      // Send Real-Time Push Notification Alert to Assigned Agent
      const agentDoc = await Agent.findById(selectedAgentId);
      if (agentDoc && agentDoc.userId) {
        PushNotificationService.notifyLoanDisbursed({
          companyId: req.tenantId,
          agentUserId: agentDoc.userId,
          customerName: customer.name,
          principalAmount: calc.principalAmount,
          accountNumber,
          installmentAmount: calc.installmentAmount,
        }).catch((e) => console.warn('[PUSH WARN]', e.message));
      }

      return ApiResponse.created(res, 'Loan disbursed and schedule generated successfully', {
        account,
        scheduleCount: installmentDocs.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Single Account with Full Installment Schedule
   */
  static async getAccountDetails(req, res, next) {
    try {
      const { id } = req.params;
      const account = await FinanceAccount.findOne({ _id: id, companyId: req.tenantId })
        .populate('customerId')
        .populate('agentId')
        .populate('productId');

      if (!account) {
        throw ApiError.notFound('Finance account not found');
      }

      const installments = await Installment.find({
        financeAccountId: account._id,
        companyId: req.tenantId,
      }).sort({ installmentNumber: 1 });

      return ApiResponse.success(res, 'Finance account and schedule retrieved', {
        account,
        installments,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = FinanceAccountController;
