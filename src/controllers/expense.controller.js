const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Agent = require('../models/Agent');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class ExpenseController {
  /**
   * Create a new Expense or Cash Injection
   */
  static async createExpense(req, res, next) {
    try {
      const {
        title,
        amount,
        type = 'EXPENSE',
        category = 'PETROL',
        paymentMethod = 'CASH',
        date,
        receiptUrl,
        notes,
        branchId,
        agentId,
      } = req.body;

      if (!title || !amount || amount <= 0) {
        throw new ApiError(400, 'Valid title and positive amount are required');
      }

      // Resolve agentId: accept from body (admin) or auto-detect from authenticated agent
      let resolvedAgentId = null;
      const companyId = req.tenantId || req.companyId;
      if (agentId) {
        const agentDoc = await Agent.findOne({ _id: agentId, companyId });
        if (!agentDoc) throw new ApiError(400, 'Agent not found in this company');
        resolvedAgentId = agentDoc._id;
      } else if (req.user && req.user.role === 'AGENT') {
        const selfAgent = await Agent.findOne({ userId: req.user.id || req.user._id, companyId });
        if (selfAgent) resolvedAgentId = selfAgent._id;
      }

      // Sanitize category & type
      const cleanType = type === 'CASH_INJECTION' ? 'CASH_INJECTION' : 'EXPENSE';
      const cleanCategory = (category || (cleanType === 'CASH_INJECTION' ? 'CAPITAL_INVESTMENT' : 'PETROL')).toUpperCase();

      const expense = await Expense.create({
        companyId,
        branchId: branchId || (req.user ? req.user.branchId : null) || null,
        agentId: resolvedAgentId || null,
        createdBy: req.user.id || req.user._id,
        title,
        amount: Number(amount),
        type: cleanType,
        category: cleanCategory,
        paymentMethod: paymentMethod || 'CASH',
        date: date ? new Date(date) : new Date(),
        receiptUrl: receiptUrl || '',
        notes: notes || '',
      });

      await AuditService.log({
        companyId,
        userId: req.user.id || req.user._id,
        userName: req.user.name || 'User',
        userRole: req.user.role || 'AGENT',
        action: cleanType === 'EXPENSE' ? 'CREATE_EXPENSE' : 'CREATE_CASH_INJECTION',
        module: 'EXPENSE',
        recordId: expense._id.toString(),
        req,
        metadata: { expenseId: expense._id, amount, type: cleanType, category: cleanCategory, agentId: resolvedAgentId },
      });

      return ApiResponse.created(
        res,
        `${cleanType === 'EXPENSE' ? 'Expense' : 'Cash Injection'} logged successfully`,
        expense
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * List Expenses with filters & pagination
   */
  static async getExpenses(req, res, next) {
    try {
      const { page = 1, limit = 20, startDate, endDate, category, type, branchId, agentId } = req.query;
      const companyId = req.tenantId || req.companyId;
      const query = { companyId };

      if (type) query.type = type;
      if (category) query.category = category.toUpperCase();
      if (branchId) query.branchId = branchId;
      if (agentId) query.agentId = agentId;

      // Agents can only see their own expenses
      if (req.user && req.user.role === 'AGENT') {
        const selfAgent = await Agent.findOne({ userId: req.user.id || req.user._id, companyId });
        if (selfAgent) query.agentId = selfAgent._id;
      }

      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.date.$lte = end;
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [expenses, total] = await Promise.all([
        Expense.find(query)
          .populate('createdBy', 'name role')
          .populate({ path: 'agentId', select: 'agentCode userId', populate: { path: 'userId', select: 'name phone' } })
          .sort({ date: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Expense.countDocuments(query),
      ]);

      return ApiResponse.success(
        res,
        'Expenses fetched successfully',
        { expenses },
        200,
        {
          page: Number(page),
          limit: Number(limit),
          total,
        }
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Agent-Wise Expense Summary for Company Admin Dashboard
   */
  static async getAgentWiseExpenses(req, res, next) {
    try {
      const { date, startDate, endDate } = req.query;
      const companyId = req.tenantId || req.companyId;

      const baseDate = date ? new Date(date) : new Date();
      const start = startDate ? new Date(startDate) : new Date(new Date(baseDate).setHours(0, 0, 0, 0));
      const end = endDate
        ? (() => { const d = new Date(endDate); d.setHours(23, 59, 59, 999); return d; })()
        : new Date(new Date(baseDate).setHours(23, 59, 59, 999));

      const agents = await Agent.find({ companyId, status: 'ACTIVE' })
        .populate('userId', 'name phone profileImage');

      const expenseAgg = await Expense.aggregate([
        { $match: { companyId, date: { $gte: start, $lte: end }, agentId: { $ne: null } } },
        {
          $group: {
            _id: '$agentId',
            totalExpense: { $sum: { $cond: [{ $eq: ['$type', 'EXPENSE'] }, '$amount', 0] } },
            totalInjection: { $sum: { $cond: [{ $eq: ['$type', 'CASH_INJECTION'] }, '$amount', 0] } },
            count: { $sum: 1 },
          },
        },
      ]);

      const statsMap = {};
      expenseAgg.forEach((e) => {
        statsMap[e._id.toString()] = e;
      });

      const result = agents.map((agent) => {
        const stats = statsMap[agent._id.toString()] || { totalExpense: 0, totalInjection: 0, count: 0 };
        const user = agent.userId || {};
        return {
          agentId: agent._id,
          agentCode: agent.agentCode,
          name: user.name || 'Unknown',
          phone: user.phone || '',
          profileImage: agent.profileImage || user.profileImage || '',
          monthlySalary: agent.monthlySalary || 0,
          dailyTarget: agent.dailyTarget || 0,
          todayExpense: stats.totalExpense,
          todayCashHandover: stats.totalInjection,
          expenseCount: stats.count,
        };
      });

      return ApiResponse.success(res, 'Agent-wise expenses fetched', result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Day End Cashbook Summary (Collections + Injections - Expenses = Net Cash in Hand)
   */
  static async getCashbookSummary(req, res, next) {
    try {
      const { date, branchId } = req.query;
      const targetDate = date ? new Date(date) : new Date();

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const paymentQuery = {
        companyId: req.tenantId || req.companyId,
        paymentDate: { $gte: startOfDay, $lte: endOfDay },
        status: 'SUCCESS',
      };
      const expenseQuery = {
        companyId: req.tenantId || req.companyId,
        date: { $gte: startOfDay, $lte: endOfDay },
      };

      if (branchId) {
        paymentQuery.branchId = branchId;
        expenseQuery.branchId = branchId;
      }

      if (req.user && req.user.role === 'AGENT') {
        paymentQuery.collectedBy = req.user.id || req.user._id;
        expenseQuery.createdBy = req.user.id || req.user._id;
      }

      // Aggregate collections
      const payments = await Payment.aggregate([
        { $match: paymentQuery },
        {
          $group: {
            _id: '$paymentMethod',
            totalAmount: { $sum: '$amountPaid' },
          },
        },
      ]);

      let cashCollected = 0;
      let upiCollected = 0;
      let bankCollected = 0;

      payments.forEach((p) => {
        if (p._id === 'CASH') cashCollected += p.totalAmount;
        else if (p._id === 'UPI') upiCollected += p.totalAmount;
        else if (p._id === 'BANK_TRANSFER') bankCollected += p.totalAmount;
        else cashCollected += p.totalAmount;
      });

      const totalCollections = cashCollected + upiCollected + bankCollected;

      // Aggregate expenses and cash injections
      const expenses = await Expense.aggregate([
        { $match: expenseQuery },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
          },
        },
      ]);

      let totalExpenses = 0;
      let totalCashInjections = 0;

      expenses.forEach((e) => {
        if (e._id === 'EXPENSE') totalExpenses += e.totalAmount;
        if (e._id === 'CASH_INJECTION') totalCashInjections += e.totalAmount;
      });

      const netCashInHand = cashCollected + totalCashInjections - totalExpenses;

      return ApiResponse.success(
        res,
        'Cashbook summary fetched successfully',
        {
          date: startOfDay.toISOString().split('T')[0],
          collections: {
            cash: cashCollected,
            upi: upiCollected,
            bank: bankCollected,
            total: totalCollections,
          },
          cashInjections: totalCashInjections,
          expenses: totalExpenses,
          netCashInHand: Math.max(0, netCashInHand),
        }
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete an expense entry
   */
  static async deleteExpense(req, res, next) {
    try {
      const { id } = req.params;
      const expense = await Expense.findOneAndDelete({ _id: id, companyId: req.tenantId || req.companyId });

      if (!expense) {
        throw new ApiError(404, 'Expense entry not found');
      }

      await AuditService.log({
        companyId: req.tenantId || req.companyId,
        userId: req.user.id || req.user._id,
        userName: req.user.name || 'User',
        userRole: req.user.role || 'ADMIN',
        action: 'DELETE_EXPENSE',
        module: 'EXPENSE',
        recordId: expense._id.toString(),
        req,
        metadata: { amount: expense.amount, title: expense.title },
      });

      return ApiResponse.success(res, 'Expense entry deleted successfully', null);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ExpenseController;
