const StaffLedger = require('../models/StaffLedger');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class StaffLedgerController {
  /**
   * Create a new Staff Ledger Transaction (Salary, Advance, Allowance)
   */
  static async createTransaction(req, res, next) {
    try {
      const {
        staffId,
        transactionType,
        amount,
        paymentMethod = 'CASH',
        date,
        notes,
        branchId,
      } = req.body;

      if (!staffId || !transactionType || !amount || amount <= 0) {
        throw new ApiError(400, 'Valid staffId, transactionType and amount are required');
      }

      const staff = await User.findOne({ _id: staffId, companyId: req.tenantId });
      if (!staff) {
        throw new ApiError(404, 'Staff member not found');
      }

      const entry = await StaffLedger.create({
        companyId: req.tenantId,
        branchId: branchId || staff.branchId || null,
        staffId,
        createdBy: req.user.id,
        transactionType,
        amount: Number(amount),
        paymentMethod,
        date: date ? new Date(date) : new Date(),
        notes: notes || '',
      });

      await AuditService.logAction({
        companyId: req.tenantId,
        userId: req.user.id,
        action: 'CREATE_STAFF_LEDGER_ENTRY',
        module: 'STAFF',
        description: `Recorded ${transactionType} of ₹${amount} for ${staff.name}`,
        metadata: { staffId, transactionType, amount },
      });

      return res
        .status(201)
        .json(ApiResponse.success(entry, 'Staff transaction recorded successfully'));
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get staff ledger list with filters
   */
  static async getLedger(req, res, next) {
    try {
      const { page = 1, limit = 20, staffId, transactionType, startDate, endDate } = req.query;
      const query = { companyId: req.tenantId };

      if (staffId) query.staffId = staffId;
      if (transactionType) query.transactionType = transactionType;

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
      const [entries, total] = await Promise.all([
        StaffLedger.find(query)
          .populate('staffId', 'name email role phone')
          .populate('createdBy', 'name role')
          .sort({ date: -1 })
          .skip(skip)
          .limit(Number(limit)),
        StaffLedger.countDocuments(query),
      ]);

      return res.status(200).json(
        ApiResponse.success(
          {
            entries,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total,
              pages: Math.ceil(total / Number(limit)),
            },
          },
          'Staff ledger fetched successfully'
        )
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Staff Financial Summary (Total Salary, Advance Balance, Petrol Allowance)
   */
  static async getStaffSummary(req, res, next) {
    try {
      const { staffId } = req.params;
      const query = { companyId: req.tenantId };
      if (staffId) query.staffId = staffId;

      const summary = await StaffLedger.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$transactionType',
            totalAmount: { $sum: '$amount' },
          },
        },
      ]);

      let salaryPaid = 0;
      let advanceGiven = 0;
      let advanceRecovered = 0;
      let petrolAllowance = 0;
      let commission = 0;

      summary.forEach((item) => {
        if (item._id === 'SALARY_PAYOUT') salaryPaid += item.totalAmount;
        if (item._id === 'ADVANCE_GIVEN') advanceGiven += item.totalAmount;
        if (item._id === 'ADVANCE_RECOVERY') advanceRecovered += item.totalAmount;
        if (item._id === 'PETROL_ALLOWANCE') petrolAllowance += item.totalAmount;
        if (item._id === 'COMMISSION') commission += item.totalAmount;
      });

      const pendingAdvance = Math.max(0, advanceGiven - advanceRecovered);

      return res.status(200).json(
        ApiResponse.success(
          {
            salaryPaid,
            advanceGiven,
            advanceRecovered,
            pendingAdvance,
            petrolAllowance,
            commission,
          },
          'Staff financial summary fetched successfully'
        )
      );
    } catch (err) {
      next(err);
    }
  }
}

module.exports = StaffLedgerController;
