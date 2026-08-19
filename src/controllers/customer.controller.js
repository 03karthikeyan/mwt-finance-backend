const Customer = require('../models/Customer');
const FinanceAccount = require('../models/FinanceAccount');
const Payment = require('../models/Payment');
const Installment = require('../models/Installment');
const Receipt = require('../models/Receipt');
const User = require('../models/User');
const PasswordUtil = require('../utils/passwordUtil');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');
const { ROLES } = require('../config/roles');
const { FinanceStatus } = require('../constants/enums');

class CustomerController {
  /**
   * List customers with search, agent filter, route filter & pagination
   */
  static async getCustomers(req, res, next) {
    try {
      const { page = 1, limit = 10, search = '', agentId, routeArea, status, branchId } = req.query;
      const query = { companyId: req.tenantId };

      if (status) query.status = status;
      if (branchId) query.branchId = branchId;
      if (agentId) query.assignedAgentId = agentId;
      if (routeArea) query['address.routeArea'] = routeArea;

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { customerCode: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      // If Field Agent, scope to their branch, assigned routes or direct assignments
      if (req.user.role === 'AGENT') {
        const Agent = require('../models/Agent');
        const agentProfile = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        if (agentProfile) {
          const agentConds = [];
          if (agentProfile.branchId) {
            agentConds.push({ branchId: agentProfile.branchId });
          }
          agentConds.push({ assignedAgentId: agentProfile._id });
          if (Array.isArray(agentProfile.assignedRoutes) && agentProfile.assignedRoutes.length > 0) {
            agentConds.push({ 'address.routeArea': { $in: agentProfile.assignedRoutes } });
          }

          if (query.$or) {
            query.$and = [{ $or: query.$or }, { $or: agentConds }];
            delete query.$or;
          } else {
            query.$or = agentConds;
          }
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [customers, total] = await Promise.all([
        Customer.find(query)
          .populate('assignedAgentId')
          .populate('branchId', 'name branchCode')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Customer.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Customers retrieved', customers, 200, {
        page,
        limit,
        total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Register a new Customer (Optional portal login creation)
   */
  static async createCustomer(req, res, next) {
    try {
      const {
        name,
        phone,
        alternatePhone,
        email,
        branchId,
        assignedAgentId,
        address = {},
        guarantor = {},
        identityProof = {},
        creditLimit = 100000,
        notes = '',
        createLoginAccount = false,
        loginPassword,
      } = req.body;

      // Check existing phone within company
      const existingPhone = await Customer.findOne({ companyId: req.tenantId, phone });
      if (existingPhone) {
        throw ApiError.conflict(`Customer with phone '${phone}' is already registered in your company.`);
      }

      // Auto-assign agent if creator is an AGENT
      let finalAgentId = assignedAgentId || null;
      if (req.user.role === 'AGENT' && !finalAgentId) {
        const Agent = require('../models/Agent');
        const myAgent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        if (myAgent) {
          finalAgentId = myAgent._id;
          // Also add route area to agent's assignedRoutes if not present
          if (address.routeArea && !myAgent.assignedRoutes.includes(address.routeArea)) {
            myAgent.assignedRoutes.push(address.routeArea);
            await myAgent.save();
          }
        }
      }

      // Generate customerCode
      const count = await Customer.countDocuments({ companyId: req.tenantId });
      const customerCode = `CUST-${(count + 1).toString().padStart(5, '0')}`;

      let userId = null;
      if (createLoginAccount && email && loginPassword) {
        const hashedPassword = await PasswordUtil.hash(loginPassword);
        const user = new User({
          companyId: req.tenantId,
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          phone,
          role: ROLES.CUSTOMER,
          status: 'ACTIVE',
        });
        await user.save();
        userId = user._id;
      }

      const customer = new Customer({
        companyId: req.tenantId,
        branchId: branchId || null,
        assignedAgentId: finalAgentId,
        userId,
        customerCode,
        name,
        phone,
        alternatePhone: alternatePhone || '',
        email: email || '',
        address,
        guarantor,
        identityProof,
        creditLimit,
        notes,
        status: 'ACTIVE',
      });
      await customer.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CUSTOMER_CREATED',
        module: 'CUSTOMERS',
        recordId: customer._id.toString(),
        req,
      });

      return ApiResponse.created(res, 'Customer registered successfully', customer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Customer Full Profile & Financial Ledger
   */
  static async getCustomerDetails(req, res, next) {
    try {
      const { id } = req.params;
      const customer = await Customer.findOne({ _id: id, companyId: req.tenantId })
        .populate('assignedAgentId')
        .populate('branchId');

      if (!customer) {
        throw ApiError.notFound('Customer not found');
      }

      // Fetch all finance accounts for this customer
      const accounts = await FinanceAccount.find({ customerId: customer._id, companyId: req.tenantId })
        .populate('productId', 'name frequency calculationType')
        .populate('agentId')
        .sort({ createdAt: -1 });

      // Fetch payment history
      const payments = await Payment.find({ customerId: customer._id, companyId: req.tenantId })
        .sort({ paymentDate: -1 })
        .limit(50);

      // Fetch receipts
      const receipts = await Receipt.find({ customerId: customer._id, companyId: req.tenantId })
        .sort({ paymentDate: -1 })
        .limit(20);

      return ApiResponse.success(res, 'Customer details and ledger retrieved', {
        customer,
        accounts,
        recentPayments: payments,
        recentReceipts: receipts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Customer info
   */
  static async updateCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const customer = await Customer.findOneAndUpdate(
        { _id: id, companyId: req.tenantId },
        updates,
        { new: true }
      );

      if (!customer) {
        throw ApiError.notFound('Customer not found');
      }

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CUSTOMER_UPDATED',
        module: 'CUSTOMERS',
        recordId: customer._id.toString(),
        req,
      });

      return ApiResponse.success(res, 'Customer updated successfully', customer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Customer Self-Service Dashboard (Customer portal/app)
   */
  static async getCustomerPortalDashboard(req, res, next) {
    try {
      const customer = await Customer.findOne({ companyId: req.tenantId, userId: req.user.id });
      if (!customer) {
        throw ApiError.notFound('Customer profile not found');
      }

      const activeAccounts = await FinanceAccount.find({
        companyId: req.tenantId,
        customerId: customer._id,
        status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      }).populate('productId', 'name frequency');

      const recentPayments = await Payment.find({
        companyId: req.tenantId,
        customerId: customer._id,
        status: 'SUCCESS',
      })
        .sort({ paymentDate: -1 })
        .limit(10);

      // Get next upcoming installment
      const upcomingInstallment = await Installment.findOne({
        companyId: req.tenantId,
        customerId: customer._id,
        status: { $in: ['UPCOMING', 'DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
      }).sort({ dueDate: 1 });

      return ApiResponse.success(res, 'Customer portal dashboard', {
        customer,
        activeAccounts,
        upcomingInstallment,
        recentPayments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete or Deactivate Customer
   */
  static async deleteCustomer(req, res, next) {
    try {
      const { id } = req.params;
      const customer = await Customer.findOne({ _id: id, companyId: req.tenantId });
      if (!customer) {
        throw ApiError.notFound('Customer not found');
      }

      const activeCount = await FinanceAccount.countDocuments({
        customerId: customer._id,
        companyId: req.tenantId,
        status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      });

      if (activeCount > 0) {
        throw ApiError.conflict(`Cannot delete borrower '${customer.name}' because they have ${activeCount} active/overdue loan account(s).`);
      }

      await Customer.findByIdAndDelete(customer._id);

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CUSTOMER_DELETED',
        module: 'CUSTOMERS',
        recordId: customer._id.toString(),
        req,
      });

      return ApiResponse.success(res, 'Borrower profile deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CustomerController;
