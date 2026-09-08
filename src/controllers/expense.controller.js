const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
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
      } = req.body;

      if (!title || !amount || amount <= 0) {
        throw new ApiError(400, 'Valid title and positive amount are required');
      }

      const expense = await Expense.create({
        companyId: req.tenantId || req.companyId,
        branchId: branchId || req.user.branchId || null,
        createdBy: req.user.id || req.user._id,
        title,
        amount: Number(amount),
        type,
        category,
        paymentMethod,
        date: date ? new Date(date) : new Date(),
        receiptUrl: receiptUrl || '',
        notes: notes || '',
      });

      await AuditService.logAction({
        companyId: req.tenantId || req.companyId,
        userId: req.user.id || req.user._id,
        action: 'CREATE_EXPENSE',
        module: 'EXPENSE',
        description: `Logged ${type} of ₹${amount} (${title})`,
        metadata: { expenseId: expense._id, amount, type, category },
      });

      return res
        .status(201)
        .json(ApiResponse.success(expense, `${type === 'EXPENSE' ? 'Expense' : 'Cash Injection'} logged successfully`));
    } catch (err) {
      next(err);
    }
  }

  /**
   * List Expenses with filters & pagination
   */
  static async getExpenses(req, res, next) {
    try {
      const { page = 1, limit = 20, startDate, endDate, category, type, branchId } = req.query;
      const query = { companyId: req.tenantId || req.companyId };

      if (type) query.type = type;
      if (category) query.category = category;
      if (branchId) query.branchId = branchId;

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
          .sort({ date: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Expense.countDocuments(query),
      ]);

      return res.status(200).json(
        ApiResponse.success(
          {
            expenses,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total,
              pages: Math.ceil(total / Number(limit)),
            },
          },
          'Expenses fetched successfully'
        )
      );
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

      return res.status(200).json(
        ApiResponse.success(
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
          },
          'Cashbook summary fetched successfully'
        )
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

      await AuditService.logAction({
        companyId: req.tenantId || req.companyId,
        userId: req.user.id || req.user._id,
        action: 'DELETE_EXPENSE',
        module: 'EXPENSE',
        description: `Deleted expense/injection of ₹${expense.amount} (${expense.title})`,
      });

      return res.status(200).json(ApiResponse.success(null, 'Expense entry deleted successfully'));
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ExpenseController;
