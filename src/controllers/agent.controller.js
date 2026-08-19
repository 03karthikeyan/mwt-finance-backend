const Agent = require('../models/Agent');
const User = require('../models/User');
const Customer = require('../models/Customer');
const FinanceAccount = require('../models/FinanceAccount');
const Payment = require('../models/Payment');
const Installment = require('../models/Installment');
const PasswordUtil = require('../utils/passwordUtil');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');
const { ROLES } = require('../config/roles');
const { FinanceStatus, InstallmentStatus } = require('../constants/enums');

class AgentController {
  /**
   * List agents with stats and pagination
   */
  static async getAgents(req, res, next) {
    try {
      const { page = 1, limit = 50, search = '', status, branchId } = req.query;
      const query = { companyId: req.tenantId };
      if (status) query.status = status;
      if (branchId) query.branchId = branchId;

      if (search) {
        query.$or = [
          { agentCode: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [agents, total] = await Promise.all([
        Agent.find(query)
          .populate('userId', 'name email phone status profileImage')
          .populate('branchId', 'name branchCode')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Agent.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Agents retrieved', agents, 200, { page, limit, total });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new Agent (Creates User + Agent record)
   */
  static async createAgent(req, res, next) {
    try {
      const {
        name,
        email,
        password,
        phone,
        agentCode,
        branchId,
        assignedRoutes = [],
        dailyTarget = 0,
        commissionPercentage = 0,
        profileImage = '',
        proofType = 'Aadhaar Card',
        proofNumber = '',
        emergencyContact = {},
        address = {},
      } = req.body;

      // Check existing email
      const existingUser = await User.findOne({ companyId: req.tenantId, email: email.toLowerCase() });
      if (existingUser) {
        throw ApiError.conflict(`A user with email '${email}' already exists in your company.`);
      }

      // Generate or check agentCode
      let code = agentCode;
      if (!code) {
        const count = await Agent.countDocuments({ companyId: req.tenantId });
        code = `AGT-${(count + 1).toString().padStart(4, '0')}`;
      } else {
        const existingCode = await Agent.findOne({ companyId: req.tenantId, agentCode: code.toUpperCase() });
        if (existingCode) {
          throw ApiError.conflict(`Agent code '${code}' is already in use.`);
        }
      }

      const hashedPassword = await PasswordUtil.hash(password);
      const user = new User({
        companyId: req.tenantId,
        branchId: branchId || null,
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        phone,
        role: ROLES.AGENT,
        status: 'ACTIVE',
        profileImage: profileImage || '',
      });
      await user.save();

      const agent = new Agent({
        companyId: req.tenantId,
        userId: user._id,
        branchId: branchId || null,
        agentCode: code.toUpperCase(),
        assignedRoutes,
        dailyTarget,
        commissionPercentage,
        profileImage: profileImage || '',
        proofType: proofType || 'Aadhaar Card',
        proofNumber: proofNumber || '',
        emergencyContact: emergencyContact || {},
        address: address || {},
        status: 'ACTIVE',
      });
      await agent.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'AGENT_CREATED',
        module: 'AGENTS',
        recordId: agent._id.toString(),
        req,
      });

      return ApiResponse.created(res, 'Agent created successfully', {
        agent,
        user: { id: user._id, name: user.name, email: user.email, phone: user.phone, profileImage: user.profileImage },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Agent Personal Dashboard for Mobile App
   */
  static async getAgentDashboard(req, res, next) {
    try {
      let agent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
      if (!agent && req.user.role === ROLES.SUPER_ADMIN) {
        agent = await Agent.findOne({ companyId: req.tenantId });
      }
      if (!agent) {
        throw ApiError.notFound('Agent profile not found for this account');
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // 1. Assigned Customers Count
      const assignedCustomersCount = await Customer.countDocuments({
        companyId: req.tenantId,
        assignedAgentId: agent._id,
        status: 'ACTIVE',
      });

      // 2. Active Finance Accounts
      const activeAccounts = await FinanceAccount.find({
        companyId: req.tenantId,
        agentId: agent._id,
        status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      }).select('_id customerId remainingAmount installmentAmount nextDueDate');

      const accountIds = activeAccounts.map((a) => a._id);

      // 3. Today's Expected from Assigned Accounts
      const todayDueInstallments = await Installment.find({
        companyId: req.tenantId,
        financeAccountId: { $in: accountIds },
        dueDate: { $gte: startOfToday, $lte: endOfToday },
      });

      const todayExpectedAmount = todayDueInstallments.reduce((sum, inst) => sum + inst.expectedAmount, 0);

      // 4. Today's Collected by this Agent
      const todayCollectedAgg = await Payment.aggregate([
        {
          $match: {
            companyId: req.tenantId,
            agentId: agent._id,
            paymentDate: { $gte: startOfToday, $lte: endOfToday },
            status: 'SUCCESS',
          },
        },
        {
          $group: {
            _id: null,
            totalCollected: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const todayStats = todayCollectedAgg[0] || { totalCollected: 0, count: 0 };

      // 5. Overdue Amount on Agent's Accounts
      const overdueAgg = await Installment.aggregate([
        {
          $match: {
            companyId: req.tenantId,
            financeAccountId: { $in: accountIds },
            dueDate: { $lt: startOfToday },
            status: { $in: [InstallmentStatus.UPCOMING, InstallmentStatus.DUE, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIALLY_PAID] },
          },
        },
        {
          $group: {
            _id: null,
            totalOverdue: { $sum: '$remainingAmount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const overdueStats = overdueAgg[0] || { totalOverdue: 0, count: 0 };

      return ApiResponse.success(res, 'Agent dashboard data retrieved', {
        agent: {
          id: agent._id,
          agentCode: agent.agentCode,
          dailyTarget: agent.dailyTarget,
          assignedRoutes: agent.assignedRoutes,
        },
        assignedCustomersCount,
        activeAccountsCount: activeAccounts.length,
        todayExpectedAmount,
        todayCollectedAmount: todayStats.totalCollected,
        todayCollectedCount: todayStats.count,
        todayPendingAmount: Math.max(0, todayExpectedAmount - todayStats.totalCollected),
        totalOverdueAmount: overdueStats.totalOverdue,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Assigned Customers for Agent Field Quick Pad
   */
  static async getMyAssignedCustomers(req, res, next) {
    try {
      let agent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
      if (!agent && req.user.role === ROLES.SUPER_ADMIN) {
        agent = await Agent.findOne({ companyId: req.tenantId });
      }
      if (!agent) {
        throw ApiError.notFound('Agent profile not found');
      }

      const { routeArea, search } = req.query;
      const hasAssignedRoutes = Array.isArray(agent.assignedRoutes) && agent.assignedRoutes.length > 0;
      const hasAssignedCusts = await Customer.exists({ companyId: req.tenantId, assignedAgentId: agent._id });

      const query = {
        companyId: req.tenantId,
        status: 'ACTIVE',
      };

      if (hasAssignedRoutes || hasAssignedCusts) {
        const conds = [{ assignedAgentId: agent._id }];
        if (hasAssignedRoutes) {
          conds.push({ 'address.routeArea': { $in: agent.assignedRoutes } });
        }
        query.$or = conds;
      }

      if (routeArea) query['address.routeArea'] = routeArea;
      if (search) {
        const searchConds = [
          { name: { $regex: search, $options: 'i' } },
          { customerCode: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
        if (query.$or) {
          query.$and = [{ $or: query.$or }, { $or: searchConds }];
          delete query.$or;
        } else {
          query.$or = searchConds;
        }
      }

      const customers = await Customer.find(query).sort({ 'address.routeArea': 1, name: 1 });

      // Attach active finance account for quick collection pad
      const customerIds = customers.map((c) => c._id);
      const activeAccounts = await FinanceAccount.find({
        companyId: req.tenantId,
        customerId: { $in: customerIds },
        status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      }).populate('productId', 'name frequency');

      // Fetch Today's Payments
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);

      const accountIds = activeAccounts.map((a) => a._id);
      const todayPayments = await Payment.find({
        companyId: req.tenantId,
        financeAccountId: { $in: accountIds },
        paymentDate: { $gte: startOfToday, $lt: endOfToday },
        status: 'SUCCESS',
      }).populate('collectedById', 'name email phone role');

      const paymentsByAccountId = {};
      todayPayments.forEach((p) => {
        if (p.financeAccountId) {
          const accIdStr = p.financeAccountId.toString();
          if (!paymentsByAccountId[accIdStr]) {
            paymentsByAccountId[accIdStr] = [];
          }
          paymentsByAccountId[accIdStr].push(p);
        }
      });

      const accountMap = {};
      activeAccounts.forEach((acc) => {
        const accIdStr = acc._id.toString();
        const accPayments = paymentsByAccountId[accIdStr] || [];
        const todayPaidAmount = accPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const isPaidToday = todayPaidAmount >= (acc.installmentAmount || 0) && todayPaidAmount > 0;
        const isPartialPaidToday = todayPaidAmount > 0 && todayPaidAmount < (acc.installmentAmount || 0);

        const lastP = accPayments.length > 0 ? accPayments[accPayments.length - 1] : null;
        const collectorInfo =
          lastP && lastP.collectedById
            ? {
                id: lastP.collectedById._id,
                name: lastP.collectedById.name,
                role: lastP.collectedById.role,
              }
            : null;

        const isOverdue = acc.nextDueDate && new Date(acc.nextDueDate) < startOfToday;

        accountMap[acc.customerId.toString()] = {
          _id: acc._id,
          accountNumber: acc.accountNumber,
          productId: acc.productId,
          installmentAmount: acc.installmentAmount,
          remainingAmount: acc.remainingAmount,
          frequency: acc.frequency,
          nextDueDate: acc.nextDueDate,
          isOverdue,
          status: acc.status,
          // Today's Status
          isPaidToday,
          isPartialPaidToday,
          todayPaidAmount,
          todayCollector: collectorInfo,
          todayReceiptNumber: lastP ? lastP.receiptNumber : null,
          todayPaymentTime: lastP ? lastP.paymentDate : null,
          todayPaymentMethod: lastP ? lastP.paymentMethod : null,
        };
      });

      const responseList = customers.map((cust) => ({
        customer: cust,
        activeAccount: accountMap[cust._id.toString()] || null,
      }));

      return ApiResponse.success(res, 'Assigned customers retrieved', responseList);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Agent Details, Routes, Target or Password
   */
  static async updateAgent(req, res, next) {
    try {
      const { id } = req.params;
      const {
        name,
        phone,
        dailyTarget,
        assignedRoutes,
        status,
        password,
        branchId,
        proofType,
        proofNumber,
        emergencyContact,
        address,
        profileImage,
      } = req.body;

      const agent = await Agent.findOne({ _id: id, companyId: req.tenantId });
      if (!agent) {
        throw ApiError.notFound('Agent not found');
      }

      if (dailyTarget !== undefined) agent.dailyTarget = dailyTarget;
      if (assignedRoutes !== undefined) agent.assignedRoutes = assignedRoutes;
      if (status !== undefined) agent.status = status;
      if (branchId !== undefined) agent.branchId = branchId || null;
      if (proofType !== undefined) agent.proofType = proofType;
      if (proofNumber !== undefined) agent.proofNumber = proofNumber;
      if (emergencyContact !== undefined) agent.emergencyContact = emergencyContact;
      if (address !== undefined) agent.address = address;
      if (profileImage !== undefined) agent.profileImage = profileImage;
      await agent.save();

      const userUpdates = {};
      if (name) userUpdates.name = name;
      if (phone) userUpdates.phone = phone;
      if (status) userUpdates.status = status;
      if (branchId !== undefined) userUpdates.branchId = branchId || null;
      if (profileImage !== undefined) userUpdates.profileImage = profileImage;
      if (password) userUpdates.password = await PasswordUtil.hash(password);

      if (Object.keys(userUpdates).length > 0 && agent.userId) {
        await User.findByIdAndUpdate(agent.userId, userUpdates);
      }

      return ApiResponse.success(res, 'Agent profile updated successfully', agent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete or Deactivate Agent
   */
  static async deleteAgent(req, res, next) {
    try {
      const { id } = req.params;
      const agent = await Agent.findOne({ _id: id, companyId: req.tenantId });
      if (!agent) {
        throw ApiError.notFound('Agent not found');
      }

      await Agent.findByIdAndDelete(agent._id);
      if (agent.userId) {
        await User.findByIdAndDelete(agent.userId);
      }

      return ApiResponse.success(res, 'Agent deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AgentController;
