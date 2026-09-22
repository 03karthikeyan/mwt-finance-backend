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
        const matchingUsers = await User.find({
          companyId: req.tenantId,
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }).distinct('_id');

        query.$or = [
          { agentCode: { $regex: search, $options: 'i' } },
          { userId: { $in: matchingUsers } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [agents, total] = await Promise.all([
        Agent.find(query)
          .populate('userId', 'name email phone status profileImage role')
          .populate('branchId', 'name branchCode')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Agent.countDocuments(query),
      ]);

      // Calculate live total collections for accurate display
      const agentIds = agents.map((a) => a._id);
      const agentUserIds = agents.map((a) => (a.userId ? a.userId._id : null)).filter(Boolean);

      const liveStatsAgg = await Payment.aggregate([
        {
          $match: {
            companyId: req.tenantId,
            $or: [
              { agentId: { $in: agentIds } },
              { collectedById: { $in: agentUserIds } },
            ],
            status: 'SUCCESS',
          },
        },
        {
          $group: {
            _id: '$agentId',
            collectedById: { $first: '$collectedById' },
            totalCollected: { $sum: '$amount' },
          },
        },
      ]);

      const statsByAgentId = {};
      const statsByUserId = {};
      liveStatsAgg.forEach((s) => {
        if (s._id) statsByAgentId[s._id.toString()] = s.totalCollected;
        if (s.collectedById) statsByUserId[s.collectedById.toString()] = s.totalCollected;
      });

      const agentsWithStats = agents.map((a) => {
        const aDoc = a.toObject ? a.toObject() : a;
        const liveTotal = statsByAgentId[a._id.toString()] ||
          (a.userId ? statsByUserId[a.userId._id ? a.userId._id.toString() : a.userId.toString()] : null) ||
          a.totalCollected ||
          0;
        return {
          ...aDoc,
          totalCollected: liveTotal,
          profileImage: aDoc.profileImage || (aDoc.userId ? aDoc.userId.profileImage : ''),
        };
      });

      return ApiResponse.success(res, 'Agents retrieved', agentsWithStats, 200, { page, limit, total });
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
        monthlySalary = 0,
        salary = 0,
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

      const effectiveSalary = Number(monthlySalary) || Number(salary) || 0;

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
        dailyTarget: Number(dailyTarget) || 0,
        commissionPercentage: Number(commissionPercentage) || 0,
        monthlySalary: effectiveSalary,
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
        monthlySalary,
        salary,
        commissionPercentage,
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

      if (dailyTarget !== undefined) agent.dailyTarget = Number(dailyTarget);
      if (commissionPercentage !== undefined) agent.commissionPercentage = Number(commissionPercentage);
      if (monthlySalary !== undefined || salary !== undefined) {
        agent.monthlySalary = Number(monthlySalary !== undefined ? monthlySalary : salary) || 0;
      }
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

      const populatedAgent = await Agent.findById(agent._id)
        .populate('userId', 'name email phone status profileImage role')
        .populate('branchId', 'name branchCode address phone email');

      return ApiResponse.success(res, 'Agent profile updated successfully', populatedAgent);
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

  /**
   * Get logged-in Agent's full profile details
   */
  static async getMyAgentProfile(req, res, next) {
    try {
      const agent = await Agent.findOne({ userId: req.user.id, companyId: req.tenantId })
        .populate('userId', 'name email phone status profileImage role')
        .populate('branchId', 'name branchCode address phone email');

      if (!agent) {
        throw ApiError.notFound('Agent profile not found for this user account');
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      // Compute live total collections and today collections
      const [totalCollectedAgg, todayCollectedAgg] = await Promise.all([
        Payment.aggregate([
          {
            $match: {
              companyId: req.tenantId,
              $or: [{ agentId: agent._id }, { collectedById: req.user.id }],
              status: 'SUCCESS',
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Payment.aggregate([
          {
            $match: {
              companyId: req.tenantId,
              $or: [{ agentId: agent._id }, { collectedById: req.user.id }],
              paymentDate: { $gte: startOfToday, $lte: endOfToday },
              status: 'SUCCESS',
            },
          },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const liveTotalCollected = totalCollectedAgg[0] ? totalCollectedAgg[0].total : (agent.totalCollected || 0);
      const liveTodayCollected = todayCollectedAgg[0] ? todayCollectedAgg[0].total : 0;

      const agentDoc = agent.toObject ? agent.toObject() : agent;
      agentDoc.totalCollected = liveTotalCollected;
      agentDoc.todayCollected = liveTodayCollected;
      agentDoc.profileImage = agentDoc.profileImage || (agentDoc.userId ? agentDoc.userId.profileImage : '');

      return ApiResponse.success(res, 'Agent profile retrieved', agentDoc);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Agent Salary & Allowance History (monthly ledger)
   */
  static async getSalaryHistory(req, res, next) {
    try {
      const { id } = req.params;
      const { months = 6 } = req.query;
      const companyId = req.tenantId || req.companyId;

      const Expense = require('../models/Expense');
      const StaffLedger = require('../models/StaffLedger');

      // Determine which agent
      let agent;
      if (!id || id === 'me') {
        agent = await Agent.findOne({ userId: req.user.id || req.user._id, companyId });
      } else {
        agent = await Agent.findOne({ _id: id, companyId });
      }
      if (!agent) throw ApiError.notFound('Agent record not found');

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - Number(months));
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      const [salaryExpenses, staffEntries] = await Promise.all([
        // All expenses and cash handovers for this agent
        Expense.find({
          companyId,
          agentId: agent._id,
          date: { $gte: startDate },
        }).sort({ date: -1 }),
        // Any staff ledger records if linked
        StaffLedger.find({
          companyId,
          staffId: agent.userId,
          date: { $gte: startDate },
        }).sort({ date: -1 }),
      ]);

      // Group by month
      const monthlyMap = {};
      const ensureMonth = (key) => {
        if (!monthlyMap[key]) {
          monthlyMap[key] = {
            month: key,
            salary: 0,
            advance: 0,
            allowance: 0,
            fuel: 0,
            cashHandover: 0,
            entries: [],
          };
        }
        return monthlyMap[key];
      };

      salaryExpenses.forEach((exp) => {
        const d = new Date(exp.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const m = ensureMonth(key);

        if (exp.type === 'CASH_INJECTION') {
          m.cashHandover += exp.amount;
        } else if (exp.category === 'SALARY') {
          m.salary += exp.amount;
        } else if (exp.category === 'SALARY_ADVANCE') {
          m.advance += exp.amount;
        } else if (['PETROL', 'FUEL'].includes(exp.category)) {
          m.fuel += exp.amount;
        } else {
          m.allowance += exp.amount;
        }

        m.entries.push({
          _id: exp._id,
          title: exp.title,
          amount: exp.amount,
          category: exp.category,
          type: exp.type,
          date: exp.date,
          notes: exp.notes,
        });
      });

      staffEntries.forEach((entry) => {
        const d = new Date(entry.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const m = ensureMonth(key);

        if (entry.transactionType === 'SALARY_PAYOUT') m.salary += entry.amount;
        else if (entry.transactionType === 'ADVANCE_GIVEN') m.advance += entry.amount;
        else if (entry.transactionType === 'PETROL_ALLOWANCE') m.fuel += entry.amount;
        else m.allowance += entry.amount;

        m.entries.push({
          _id: entry._id,
          title: entry.transactionType.replace(/_/g, ' '),
          amount: entry.amount,
          category: entry.transactionType,
          type: 'STAFF_LEDGER',
          date: entry.date,
          notes: entry.notes,
        });
      });

      const history = Object.values(monthlyMap).sort((a, b) => b.month.localeCompare(a.month));

      return ApiResponse.success(res, 'Salary history retrieved', {
        agentId: agent._id,
        agentCode: agent.agentCode,
        monthlySalary: agent.monthlySalary || 0,
        history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Morning Cash Report — all agents and their cash handover for today
   */
  static async getMorningCashReport(req, res, next) {
    try {
      const companyId = req.tenantId;
      const { date } = req.query;
      const Expense = require('../models/Expense');

      const targetDate = date ? new Date(date) : new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const agents = await Agent.find({ companyId, status: 'ACTIVE' })
        .populate('userId', 'name phone profileImage email');

      const handoverAgg = await Expense.aggregate([
        {
          $match: {
            companyId,
            type: 'CASH_INJECTION',
            agentId: { $ne: null },
            date: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: '$agentId',
            totalHandover: { $sum: '$amount' },
            entries: {
              $push: { title: '$title', amount: '$amount', date: '$date', notes: '$notes' },
            },
          },
        },
      ]);

      const handoverMap = {};
      handoverAgg.forEach((h) => {
        handoverMap[h._id.toString()] = h;
      });

      // Also get today's collections per agent
      const collectionsAgg = await Payment.aggregate([
        {
          $match: {
            companyId,
            agentId: { $ne: null },
            paymentDate: { $gte: startOfDay, $lte: endOfDay },
            status: 'SUCCESS',
          },
        },
        { $group: { _id: '$agentId', totalCollected: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]);

      const collectionsMap = {};
      collectionsAgg.forEach((c) => {
        collectionsMap[c._id.toString()] = c;
      });

      const report = agents.map((agent) => {
        const handover = handoverMap[agent._id.toString()] || { totalHandover: 0, entries: [] };
        const collections = collectionsMap[agent._id.toString()] || { totalCollected: 0, count: 0 };
        const user = agent.userId || {};
        return {
          agentId: agent._id,
          agentCode: agent.agentCode,
          name: user.name || 'Unknown',
          phone: user.phone || '',
          profileImage: agent.profileImage || user.profileImage || '',
          dailyTarget: agent.dailyTarget || 0,
          morningCashGiven: handover.totalHandover,
          handoverEntries: handover.entries,
          todayCollected: collections.totalCollected,
          todayTransactions: collections.count,
          netBalance: collections.totalCollected - handover.totalHandover,
        };
      });

      return ApiResponse.success(res, 'Morning cash report retrieved', {
        date: startOfDay.toISOString().split('T')[0],
        report,
        totalHandedOut: report.reduce((s, r) => s + r.morningCashGiven, 0),
        totalCollected: report.reduce((s, r) => s + r.todayCollected, 0),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Agent Performance — collection vs target stats
   */
  static async getAgentPerformance(req, res, next) {
    try {
      const { id } = req.params;
      const { months = 3 } = req.query;
      const companyId = req.tenantId;

      let agent;
      if (id === 'me') {
        agent = await Agent.findOne({ userId: req.user.id, companyId }).populate('userId', 'name');
      } else {
        agent = await Agent.findOne({ _id: id, companyId }).populate('userId', 'name');
      }
      if (!agent) throw ApiError.notFound('Agent not found');

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - Number(months));
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);

      // Monthly collections
      const collectionsAgg = await Payment.aggregate([
        {
          $match: {
            companyId,
            agentId: agent._id,
            status: 'SUCCESS',
            paymentDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' },
            },
            totalCollected: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]);

      const monthlyData = collectionsAgg.map((m) => {
        const monthKey = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
        const workingDays = 26; // approx
        const monthlyTarget = (agent.dailyTarget || 0) * workingDays;
        const achievementPct = monthlyTarget > 0 ? Math.round((m.totalCollected / monthlyTarget) * 100) : 0;
        const commission = ((agent.commissionPercentage || 0) / 100) * m.totalCollected;
        return {
          month: monthKey,
          totalCollected: m.totalCollected,
          count: m.count,
          monthlyTarget,
          achievementPercentage: achievementPct,
          commissionEarned: Math.round(commission),
        };
      });

      // All-time totals
      const totalAgg = await Payment.aggregate([
        { $match: { companyId, agentId: agent._id, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]);
      const allTime = totalAgg[0] || { total: 0, count: 0 };

      return ApiResponse.success(res, 'Agent performance retrieved', {
        agentId: agent._id,
        agentCode: agent.agentCode,
        name: agent.userId ? agent.userId.name : '',
        dailyTarget: agent.dailyTarget || 0,
        commissionPercentage: agent.commissionPercentage || 0,
        monthlySalary: agent.monthlySalary || 0,
        allTimeCollected: allTime.total,
        allTimeTransactions: allTime.count,
        monthlyData,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AgentController;

