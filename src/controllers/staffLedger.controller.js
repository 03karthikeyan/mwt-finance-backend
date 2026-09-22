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

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id || req.user._id,
        userName: req.user.name || 'User',
        userRole: req.user.role || 'ADMIN',
        action: 'CREATE_STAFF_LEDGER_ENTRY',
        module: 'STAFF',
        recordId: entry._id.toString(),
        req,
        metadata: { staffId, transactionType, amount },
      });

      return ApiResponse.created(
        res,
        'Staff transaction recorded successfully',
        entry
      );
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

      return ApiResponse.success(
        res,
        'Staff ledger fetched successfully',
        { entries },
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

      return ApiResponse.success(
        res,
        'Staff financial summary fetched successfully',
        {
          salaryPaid,
          advanceGiven,
          advanceRecovered,
          pendingAdvance,
          petrolAllowance,
          commission,
        }
      );
    } catch (err) {
      next(err);
    }
  }
}

module.exports = StaffLedgerController;
