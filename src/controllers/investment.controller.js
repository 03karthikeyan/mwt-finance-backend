const Investment = require('../models/Investment');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const auditService = require('../services/audit.service');

// Get all investments and net capital summary
const getInvestments = async (req, res, next) => {
  try {
    const { branchId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
    const companyId = req.companyId;

    const query = { companyId };
    if (branchId) query.branchId = branchId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.investmentDate = {};
      if (startDate) query.investmentDate.$gte = new Date(startDate);
      if (endDate) query.investmentDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const investments = await Investment.find(query)
      .populate('createdBy', 'name email')
      .populate('branchId', 'name branchCode')
      .sort({ investmentDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Investment.countDocuments(query);

    // Calculate Capital Summary
    const capitalStats = await Investment.aggregate([
      { $match: { companyId } },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    let totalInflow = 0;
    let totalOutflow = 0;

    capitalStats.forEach((stat) => {
      if (stat._id === 'CAPITAL_INFLOW') {
        totalInflow += stat.totalAmount;
      } else {
        totalOutflow += stat.totalAmount;
      }
    });

    const netCapitalBalance = totalInflow - totalOutflow;

    return ApiResponse.success(res, 'Capital investments retrieved successfully', {
      investments,
      summary: {
        totalInflow,
        totalOutflow,
        netCapitalBalance,
      },
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

// Record new capital investment or withdrawal
const createInvestment = async (req, res, next) => {
  try {
    const { investorName, type, amount, investmentDate, paymentMode, referenceNo, branchId, notes } = req.body;
    const companyId = req.companyId;

    if (!investorName || !amount) {
      throw ApiError.badRequest('Investor Name and Amount are required');
    }

    const investment = await Investment.create({
      companyId,
      branchId: branchId || req.user.branchId || null,
      investorName,
      type: type || 'CAPITAL_INFLOW',
      amount: Number(amount),
      investmentDate: investmentDate ? new Date(investmentDate) : new Date(),
      paymentMode: paymentMode || 'BANK_TRANSFER',
      referenceNo: referenceNo || '',
      notes: notes || '',
      createdBy: req.user._id,
    });

    await auditService.logAction({
      req,
      action: 'INVESTMENT_CREATE',
      entity: 'Investment',
      entityId: investment._id,
      details: { investorName, type, amount },
    });

    return ApiResponse.created(res, 'Capital transaction recorded successfully', { investment });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvestments,
  createInvestment,
};
