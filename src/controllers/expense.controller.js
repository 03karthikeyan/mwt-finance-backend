const Expense = require('../models/Expense');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const auditService = require('../services/audit.service');

// Get all expenses with filtering & pagination
const getExpenses = async (req, res, next) => {
  try {
    const { branchId, category, status, startDate, endDate, page = 1, limit = 50 } = req.query;
    const companyId = req.companyId;

    const query = { companyId };
    if (branchId) query.branchId = branchId;
    if (category) query.category = category;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.expenseDate = {};
      if (startDate) query.expenseDate.$gte = new Date(startDate);
      if (endDate) query.expenseDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const expenses = await Expense.find(query)
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email')
      .populate('branchId', 'name branchCode')
      .sort({ expenseDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Expense.countDocuments(query);

    // Aggregate total approved expenses amount
    const totalApprovedStats = await Expense.aggregate([
      { $match: { ...query, status: 'APPROVED' } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    ]);

    const totalApprovedAmount = totalApprovedStats.length > 0 ? totalApprovedStats[0].totalAmount : 0;

    return ApiResponse.success(res, 'Expenses retrieved successfully', {
      expenses,
      totalApprovedAmount,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create new expense
const createExpense = async (req, res, next) => {
  try {
    const { title, category, amount, expenseDate, paymentMode, branchId, receiptImage, notes } = req.body;
    const companyId = req.companyId;

    if (!title || !amount) {
      throw ApiError.badRequest('Title and Amount are required');
    }

    // Role-based auto approval vs pending approval
    const isAutoApproved = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'].includes(req.user.role);
    const status = isAutoApproved ? 'APPROVED' : 'PENDING';

    const expense = await Expense.create({
      companyId,
      branchId: branchId || req.user.branchId || null,
      agentId: req.user.role === 'AGENT' ? req.user._id : null,
      title,
      category: category || 'MISCELLANEOUS',
      amount: Number(amount),
      expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
      paymentMode: paymentMode || 'CASH',
      receiptImage: receiptImage || '',
      notes: notes || '',
      status,
      createdBy: req.user._id,
      approvedBy: isAutoApproved ? req.user._id : null,
      approvalDate: isAutoApproved ? new Date() : null,
    });

    await auditService.logAction({
      req,
      action: 'EXPENSE_CREATE',
      entity: 'Expense',
      entityId: expense._id,
      details: { title, amount, category, status },
    });

    return ApiResponse.created(res, 'Expense recorded successfully', { expense });
  } catch (error) {
    next(error);
  }
};

// Approve or Reject Expense
const updateExpenseStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw ApiError.badRequest('Status must be APPROVED or REJECTED');
    }

    const expense = await Expense.findOne({ _id: id, companyId: req.companyId });
    if (!expense) {
      throw ApiError.notFound('Expense not found');
    }

    expense.status = status;
    expense.approvedBy = req.user._id;
    expense.approvalDate = new Date();
    if (rejectionReason) expense.rejectionReason = rejectionReason;

    await expense.save();

    await auditService.logAction({
      req,
      action: `EXPENSE_${status}`,
      entity: 'Expense',
      entityId: expense._id,
      details: { status, rejectionReason },
    });

    return ApiResponse.success(res, `Expense ${status.toLowerCase()} successfully`, { expense });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpenseStatus,
};
