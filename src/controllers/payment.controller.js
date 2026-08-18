const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Receipt = require('../models/Receipt');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

class PaymentController {
  /**
   * List Payments with pagination, date filters & search
   */
  static async getPayments(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        agentId,
        customerId,
        paymentMethod,
        startDate,
        endDate,
      } = req.query;

      const query = { companyId: req.tenantId, status: 'SUCCESS' };
      if (agentId) query.agentId = agentId;
      if (customerId) query.customerId = customerId;
      if (paymentMethod) query.paymentMethod = paymentMethod;

      if (startDate || endDate) {
        query.paymentDate = {};
        if (startDate) query.paymentDate.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.paymentDate.$lte = end;
        }
      }

      if (search) {
        query.$or = [
          { paymentNumber: { $regex: search, $options: 'i' } },
          { receiptNumber: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      const [payments, total] = await Promise.all([
        Payment.find(query)
          .populate('customerId', 'name customerCode phone')
          .populate('agentId')
          .populate('financeAccountId', 'accountNumber principalAmount remainingAmount')
          .populate('collectedById', 'name email')
          .sort({ paymentDate: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Payment.countDocuments(query),
      ]);

      return ApiResponse.success(res, 'Payments retrieved', payments, 200, {
        page,
        limit,
        total,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Single Payment Details with Breakdown Allocations
   */
  static async getPaymentDetails(req, res, next) {
    try {
      const { id } = req.params;
      const payment = await Payment.findOne({ _id: id, companyId: req.tenantId })
        .populate('customerId')
        .populate('agentId')
        .populate('financeAccountId')
        .populate('collectedById', 'name email phone');

      if (!payment) {
        throw ApiError.notFound('Payment record not found');
      }

      const [allocations, receipt] = await Promise.all([
        PaymentAllocation.find({ paymentId: payment._id, companyId: req.tenantId }).populate('installmentId'),
        Receipt.findOne({ paymentId: payment._id, companyId: req.tenantId }),
      ]);

      return ApiResponse.success(res, 'Payment details retrieved', {
        payment,
        allocations,
        receipt,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentController;
