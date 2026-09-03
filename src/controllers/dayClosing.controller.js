const DayClosing = require('../models/DayClosing');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const auditService = require('../services/audit.service');

// Calculate agent live day summary before submission
const getAgentDaySummary = async (req, res, next) => {
  try {
    const { agentId, date } = req.query;
    const companyId = req.companyId;

    const targetAgentId = agentId || (req.user.role === 'AGENT' ? req.user._id : null);
    if (!targetAgentId) {
      throw ApiError.badRequest('Agent ID is required');
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Aggregate Cash Payments collected by agent today
    const cashPayments = await Payment.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          paymentDate: { $gte: startOfDay, $lte: endOfDay },
          paymentMethod: 'CASH',
          status: 'SUCCESS',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    // Aggregate Online/UPI Payments collected by agent today
    const onlinePayments = await Payment.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          paymentDate: { $gte: startOfDay, $lte: endOfDay },
          paymentMethod: { $ne: 'CASH' },
          status: 'SUCCESS',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    // Aggregate Agent Expenses today
    const agentExpenses = await Expense.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          expenseDate: { $gte: startOfDay, $lte: endOfDay },
          status: { $ne: 'REJECTED' },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const cashCollected = cashPayments.length > 0 ? cashPayments[0].total : 0;
    const onlineCollected = onlinePayments.length > 0 ? onlinePayments[0].total : 0;
    const expensesAmount = agentExpenses.length > 0 ? agentExpenses[0].total : 0;
    const openingCash = 0; // Configurable opening float
    const expectedClosingCash = Math.max(0, openingCash + cashCollected - expensesAmount);

    return ApiResponse.success(res, 'Agent day summary calculated', {
      agentId: targetAgentId,
      date: startOfDay,
      openingCash,
      cashCollected,
      onlineCollected,
      expensesAmount,
      cashAdvances: 0,
      expectedClosingCash,
    });
  } catch (error) {
    next(error);
  }
};

// Submit Day Closing Cash Settlement
const submitDayClosing = async (req, res, next) => {
  try {
    const { agentId, date, openingCash = 0, actualCashSubmitted, notes } = req.body;
    const companyId = req.companyId;

    const targetAgentId = agentId || (req.user.role === 'AGENT' ? req.user._id : null);
    if (!targetAgentId || actualCashSubmitted === undefined) {
      throw ApiError.badRequest('Agent ID and Actual Cash Submitted are required');
    }

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    // Calculate actual figures
    const cashPayments = await Payment.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          paymentDate: { $gte: startOfDay, $lte: endOfDay },
          paymentMethod: 'CASH',
          status: 'SUCCESS',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const onlinePayments = await Payment.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          paymentDate: { $gte: startOfDay, $lte: endOfDay },
          paymentMethod: { $ne: 'CASH' },
          status: 'SUCCESS',
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const agentExpenses = await Expense.aggregate([
      {
        $match: {
          companyId,
          agentId: targetAgentId,
          expenseDate: { $gte: startOfDay, $lte: endOfDay },
          status: { $ne: 'REJECTED' },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const cashCollected = cashPayments.length > 0 ? cashPayments[0].total : 0;
    const onlineCollected = onlinePayments.length > 0 ? onlinePayments[0].total : 0;
    const expensesAmount = agentExpenses.length > 0 ? agentExpenses[0].total : 0;
    const expectedClosingCash = Math.max(0, Number(openingCash) + cashCollected - expensesAmount);
    const shortageOrExcess = Number(actualCashSubmitted) - expectedClosingCash;

    const isAutoVerified = ['SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'].includes(req.user.role);

    let dayClosing = await DayClosing.findOne({
      companyId,
      agentId: targetAgentId,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (dayClosing) {
      dayClosing.cashCollected = cashCollected;
      dayClosing.onlineCollected = onlineCollected;
      dayClosing.expensesAmount = expensesAmount;
      dayClosing.expectedClosingCash = expectedClosingCash;
      dayClosing.actualCashSubmitted = Number(actualCashSubmitted);
      dayClosing.shortageOrExcess = shortageOrExcess;
      dayClosing.status = isAutoVerified ? 'VERIFIED' : 'PENDING_VERIFICATION';
      if (isAutoVerified) {
        dayClosing.verifiedBy = req.user._id;
        dayClosing.verificationDate = new Date();
      }
      dayClosing.notes = notes || dayClosing.notes;
      await dayClosing.save();
    } else {
      dayClosing = await DayClosing.create({
        companyId,
        branchId: req.user.branchId || null,
        agentId: targetAgentId,
        date: startOfDay,
        openingCash: Number(openingCash),
        cashCollected,
        onlineCollected,
        expensesAmount,
        expectedClosingCash,
        actualCashSubmitted: Number(actualCashSubmitted),
        shortageOrExcess,
        status: isAutoVerified ? 'VERIFIED' : 'PENDING_VERIFICATION',
        verifiedBy: isAutoVerified ? req.user._id : null,
        verificationDate: isAutoVerified ? new Date() : null,
        notes: notes || '',
      });
    }

    await auditService.logAction({
      req,
      action: 'DAY_CLOSING_SUBMIT',
      entity: 'DayClosing',
      entityId: dayClosing._id,
      details: { expectedClosingCash, actualCashSubmitted, shortageOrExcess },
    });

    return ApiResponse.created(res, 'Day closing cash settlement submitted', { dayClosing });
  } catch (error) {
    next(error);
  }
};

// Manager Day Closing Verification
const verifyDayClosing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const dayClosing = await DayClosing.findOne({ _id: id, companyId: req.companyId });
    if (!dayClosing) {
      throw ApiError.notFound('Day closing record not found');
    }

    dayClosing.status = status || 'VERIFIED';
    dayClosing.verifiedBy = req.user._id;
    dayClosing.verificationDate = new Date();
    if (notes) dayClosing.notes = notes;

    await dayClosing.save();

    await auditService.logAction({
      req,
      action: 'DAY_CLOSING_VERIFY',
      entity: 'DayClosing',
      entityId: dayClosing._id,
      details: { status: dayClosing.status },
    });

    return ApiResponse.success(res, 'Day closing record verified successfully', { dayClosing });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgentDaySummary,
  submitDayClosing,
  verifyDayClosing,
};
