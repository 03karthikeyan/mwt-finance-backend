const ReportService = require('../services/report.service');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const FinanceAccount = require('../models/FinanceAccount');
const ApiResponse = require('../utils/apiResponse');

class ReportController {
  static async getDailyReport(req, res, next) {
    try {
      const { date, branchId } = req.query;
      const report = await ReportService.getDailyCollectionReport(
        req.tenantId,
        date ? new Date(date) : new Date(),
        branchId
      );
      return ApiResponse.success(res, 'Daily collection report', report);
    } catch (error) {
      next(error);
    }
  }

  static async getWeeklyReport(req, res, next) {
    try {
      const { branchId } = req.query;
      const report = await ReportService.getWeeklyCollectionReport(req.tenantId, branchId);
      return ApiResponse.success(res, 'Weekly collection report', report);
    } catch (error) {
      next(error);
    }
  }

  static async getMonthlyReport(req, res, next) {
    try {
      const { branchId } = req.query;
      const report = await ReportService.getMonthlyCollectionReport(req.tenantId, branchId);
      return ApiResponse.success(res, 'Monthly collection report', report);
    } catch (error) {
      next(error);
    }
  }

  static async getAgentPerformanceReport(req, res, next) {
    try {
      const { branchId } = req.query;
      const report = await ReportService.getAgentPerformanceReport(req.tenantId, branchId);
      return ApiResponse.success(res, 'Agent performance report', report);
    } catch (error) {
      next(error);
    }
  }

  static async getDefaultersReport(req, res, next) {
    try {
      const { branchId } = req.query;
      const report = await ReportService.getDefaultersReport(req.tenantId, branchId);
      return ApiResponse.success(res, 'Defaulters and overdue report', report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export Collection Payments to CSV
   */
  static async exportPaymentsCsv(req, res, next) {
    try {
      const { startDate, endDate } = req.query;
      const query = { companyId: req.tenantId, status: 'SUCCESS' };

      if (startDate || endDate) {
        query.paymentDate = {};
        if (startDate) query.paymentDate.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.paymentDate.$lte = end;
        }
      }

      const payments = await Payment.find(query)
        .populate('customerId', 'name customerCode phone')
        .populate('financeAccountId', 'accountNumber')
        .populate('collectedById', 'name')
        .sort({ paymentDate: -1 })
        .limit(1000);

      let csv = 'Receipt No,Payment No,Date,Customer Name,Customer Phone,Account No,Amount,Penalty,Payment Mode,Collected By\n';

      payments.forEach((p) => {
        const dateStr = p.paymentDate ? p.paymentDate.toISOString().split('T')[0] : '';
        const custName = p.customerId ? `"${p.customerId.name}"` : 'Unknown';
        const custPhone = p.customerId ? p.customerId.phone : '';
        const accNo = p.financeAccountId ? p.financeAccountId.accountNumber : '';
        const collectedBy = p.collectedById ? `"${p.collectedById.name}"` : '';

        csv += `${p.receiptNumber},${p.paymentNumber},${dateStr},${custName},${custPhone},${accNo},${p.amount},${p.penaltyCollected},${p.paymentMethod},${collectedBy}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=collections_export_${Date.now()}.csv`);
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReportController;
