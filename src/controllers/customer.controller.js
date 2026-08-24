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
      const Company = require('../models/Company');
      const Agent = require('../models/Agent');

      let customer = await Customer.findOne({
        companyId: req.tenantId,
        $or: [{ userId: req.user.id }, { phone: req.user.phone }],
      })
        .populate({
          path: 'assignedAgentId',
          populate: { path: 'userId', select: 'name phone email profileImage' },
        })
        .populate('branchId', 'name branchCode phone address district');

      if (!customer) {
        throw ApiError.notFound('Borrower profile not found for this account');
      }

      // Fetch company profile for branding & contact
      const company = await Company.findById(req.tenantId).select(
        'name companyCode phone email supportPhone currency logo address'
      );

      // Fetch all accounts for this customer
      const allAccounts = await FinanceAccount.find({
        companyId: req.tenantId,
        customerId: customer._id,
      })
        .populate('productId', 'name productCode frequency calculationType')
        .populate({
          path: 'agentId',
          populate: { path: 'userId', select: 'name phone profileImage' },
        })
        .populate('branchId', 'name branchCode phone')
        .sort({ createdAt: -1 });

      const activeAccounts = allAccounts.filter((acc) =>
        [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE].includes(acc.status)
      );

      const completedAccounts = allAccounts.filter((acc) =>
        [FinanceStatus.COMPLETED].includes(acc.status)
      );

      // Calculate dynamic totals
      let totalBorrowed = 0;
      let totalPayable = 0;
      let totalPaid = 0;
      let totalOutstanding = 0;

      allAccounts.forEach((acc) => {
        totalBorrowed += acc.principalAmount || 0;
        totalPayable += acc.totalPayableAmount || 0;
        totalPaid += acc.totalPaidAmount || 0;
        totalOutstanding += acc.remainingAmount || 0;
      });

      // Get next upcoming installment across active accounts
      const upcomingInstallment = await Installment.findOne({
        companyId: req.tenantId,
        customerId: customer._id,
        status: { $in: ['UPCOMING', 'DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
      })
        .populate({
          path: 'financeAccountId',
          select: 'accountNumber frequency installmentAmount',
          populate: { path: 'productId', select: 'name frequency' },
        })
        .sort({ dueDate: 1 });

      // Recent Payments
      const recentPayments = await Payment.find({
        companyId: req.tenantId,
        customerId: customer._id,
        status: 'SUCCESS',
      })
        .populate('collectedBy', 'name phone')
        .populate('financeAccountId', 'accountNumber')
        .sort({ paymentDate: -1 })
        .limit(20);

      // Assigned Agent details (Who will collect - branch based & route based fallback)
      const Agent = require('../models/Agent');
      let agentDoc = customer.assignedAgentId;

      if (!agentDoc && customer.address?.routeArea) {
        agentDoc = await Agent.findOne({
          companyId: req.tenantId,
          assignedRoutes: { $regex: new RegExp(`^${customer.address.routeArea.trim()}$`, 'i') },
        }).populate('userId', 'name phone email profileImage');
      }

      if (!agentDoc && customer.branchId) {
        const bId = customer.branchId._id || customer.branchId;
        agentDoc = await Agent.findOne({
          companyId: req.tenantId,
          branchId: bId,
        }).populate('userId', 'name phone email profileImage');
      }

      if (!agentDoc && activeAccounts.length > 0 && activeAccounts[0].agentId) {
        agentDoc = activeAccounts[0].agentId;
      }

      let assignedAgent = null;
      if (agentDoc) {
        assignedAgent = {
          id: agentDoc._id,
          agentCode: agentDoc.agentCode || 'FIELD-AGENT',
          name: agentDoc.userId?.name || 'Branch Field Collector',
          phone: agentDoc.userId?.phone || customer.branchId?.phone || company?.phone || '',
          email: agentDoc.userId?.email || '',
          profileImage: agentDoc.profileImage || agentDoc.userId?.profileImage || '',
          assignedRoutes: agentDoc.assignedRoutes || [],
        };
      } else if (customer.branchId) {
        assignedAgent = {
          id: customer.branchId._id,
          agentCode: customer.branchId.branchCode || 'BRANCH',
          name: `${customer.branchId.name} Collection Desk`,
          phone: customer.branchId.phone || company?.phone || '',
          email: company?.email || '',
          profileImage: '',
          assignedRoutes: [customer.address?.routeArea || 'General Area'],
        };
      }

      return ApiResponse.success(res, 'Customer portal dashboard retrieved', {
        customer: {
          id: customer._id,
          name: customer.name,
          customerCode: customer.customerCode,
          phone: customer.phone,
          alternatePhone: customer.alternatePhone,
          email: customer.email,
          address: customer.address,
          guarantor: customer.guarantor,
          creditLimit: customer.creditLimit,
          profileImage: customer.profileImage,
          status: customer.status,
        },
        assignedAgent,
        branch: customer.branchId
          ? {
              id: customer.branchId._id,
              name: customer.branchId.name,
              branchCode: customer.branchId.branchCode,
              phone: customer.branchId.phone,
              address: customer.branchId.address,
            }
          : null,
        company: company
          ? {
              id: company._id,
              name: company.name,
              companyCode: company.companyCode,
              currency: company.currency,
              logo: company.logo,
              phone: company.phone,
              email: company.email,
              supportPhone: company.supportPhone || company.phone,
              address: company.address,
            }
          : null,
        summary: {
          totalBorrowed,
          totalPayable,
          totalPaid,
          totalOutstanding,
          activeLoansCount: activeAccounts.length,
          completedLoansCount: completedAccounts.length,
          totalLoansCount: allAccounts.length,
        },
        activeAccounts,
        completedAccounts,
        upcomingInstallment,
        recentPayments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Full Schedule & Ledger for a specific customer loan account
   */
  static async getCustomerLoanSchedule(req, res, next) {
    try {
      const { id } = req.params;

      const customer = await Customer.findOne({
        companyId: req.tenantId,
        $or: [{ userId: req.user.id }, { phone: req.user.phone }],
      });

      if (!customer) {
        throw ApiError.notFound('Customer profile not found');
      }

      const account = await FinanceAccount.findOne({
        _id: id,
        companyId: req.tenantId,
        customerId: customer._id,
      })
        .populate('productId', 'name productCode frequency calculationType docChargePercentage interestPercentage')
        .populate({
          path: 'agentId',
          populate: { path: 'userId', select: 'name phone profileImage' },
        })
        .populate('branchId', 'name branchCode phone address');

      if (!account) {
        throw ApiError.notFound('Loan account not found');
      }

      const schedule = await Installment.find({
        financeAccountId: account._id,
        companyId: req.tenantId,
      }).sort({ installmentNumber: 1 });

      const payments = await Payment.find({
        financeAccountId: account._id,
        companyId: req.tenantId,
        status: 'SUCCESS',
      })
        .populate('collectedBy', 'name phone')
        .sort({ paymentDate: -1 });

      return ApiResponse.success(res, 'Loan account schedule and details retrieved', {
        account,
        schedule,
        payments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Customer Payments Ledger
   */
  static async getCustomerPayments(req, res, next) {
    try {
      const customer = await Customer.findOne({
        companyId: req.tenantId,
        $or: [{ userId: req.user.id }, { phone: req.user.phone }],
      });

      if (!customer) {
        throw ApiError.notFound('Customer profile not found');
      }

      const payments = await Payment.find({
        companyId: req.tenantId,
        customerId: customer._id,
      })
        .populate('financeAccountId', 'accountNumber totalPayableAmount remainingAmount')
        .populate('collectedBy', 'name phone')
        .sort({ paymentDate: -1 });

      return ApiResponse.success(res, 'Customer payments retrieved', payments);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set / Reset Customer App Login Password (Admin or Agent)
   */
  static async setCustomerLoginAccess(req, res, next) {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 4) {
        throw ApiError.badRequest('Password must be at least 4 characters long');
      }

      const customer = await Customer.findOne({ _id: id, companyId: req.tenantId });
      if (!customer) {
        throw ApiError.notFound('Customer not found');
      }

      const hashedPassword = await PasswordUtil.hash(password);
      let user;

      if (customer.userId) {
        user = await User.findById(customer.userId);
        if (user) {
          user.password = hashedPassword;
          user.phone = customer.phone;
          user.name = customer.name;
          user.status = 'ACTIVE';
          await user.save();
        }
      }

      if (!user) {
        // Check if a user already exists with this phone in the company
        user = await User.findOne({ companyId: req.tenantId, phone: customer.phone });
        if (user) {
          user.password = hashedPassword;
          user.role = ROLES.CUSTOMER;
          user.status = 'ACTIVE';
          await user.save();
        } else {
          const email = customer.email && customer.email.trim().length > 0
            ? customer.email.toLowerCase().trim()
            : `${customer.phone.replace(/\D/g, '')}@customer.mwt`;

          user = await User.create({
            companyId: req.tenantId,
            branchId: customer.branchId || null,
            name: customer.name,
            phone: customer.phone,
            email,
            password: hashedPassword,
            role: ROLES.CUSTOMER,
            status: 'ACTIVE',
          });
        }

        customer.userId = user._id;
        await customer.save();
      }

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'CUSTOMER_LOGIN_CREDENTIALS_UPDATED',
        module: 'CUSTOMERS',
        recordId: customer._id.toString(),
        req,
      });

      return ApiResponse.success(res, `App login credentials activated for ${customer.name}`, {
        customerId: customer._id,
        userId: user._id,
        phone: customer.phone,
        hasLoginAccess: true,
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
