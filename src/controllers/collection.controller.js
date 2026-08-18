const CollectionService = require('../services/collection.service');
const Collection = require('../models/Collection');
const FinanceAccount = require('../models/FinanceAccount');
const Installment = require('../models/Installment');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');
const PushNotificationService = require('../services/pushNotification.service');
const { FinanceStatus } = require('../constants/enums');

class CollectionController {
  /**
   * Record Single Collection ("Collecting" installment)
   */
  static async recordCollection(req, res, next) {
    try {
      const {
        financeAccountId,
        amount,
        penaltyCollected = 0,
        paymentMethod = 'CASH',
        transactionReference = '',
        agentId,
        customerLocation,
        notes = '',
        idempotencyKey,
      } = req.body;

      const result = await CollectionService.recordCollection({
        companyId: req.tenantId,
        financeAccountId,
        amount,
        penaltyCollected,
        paymentMethod,
        transactionReference,
        agentId: agentId || (req.user.role === 'AGENT' ? req.user.id : undefined),
        collectedById: req.user.id,
        customerLocation,
        notes,
        idempotencyKey,
      });

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PAYMENT_COLLECTED',
        module: 'COLLECTIONS',
        recordId: result.payment ? result.payment._id.toString() : '',
        req,
        metadata: {
          receiptNumber: result.receipt ? result.receipt.receiptNumber : '',
          amount,
          paymentMethod,
        },
      });

      // Send Real-Time Push Notification Alert to Company Admin
      PushNotificationService.notifyPaymentCollected({
        companyId: req.tenantId,
        collectorName: req.user.name,
        customerName: result.customer?.name || (result.account?.customerId && result.account.customerId.name) || 'Borrower',
        amount,
        receiptNo: result.receipt ? result.receipt.receiptNumber : '',
        accountNumber: result.account ? result.account.accountNumber : '',
      }).catch((e) => console.warn('[PUSH WARN]', e.message));

      return ApiResponse.success(res, 'Payment collected successfully', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Collection Sheet (Field agent / Back office line collection list with date & staff filtering)
   */
  static async getTodayCollectionSheet(req, res, next) {
    try {
      const { routeArea, agentId, frequency, search, statusFilter, date, branchId } = req.query;

      // Target Date Window (default: today)
      let targetDate = new Date();
      if (date) {
        const parsed = new Date(date);
        if (!isNaN(parsed.getTime())) {
          targetDate = parsed;
        }
      }
      const startOfDate = new Date(targetDate);
      startOfDate.setHours(0, 0, 0, 0);
      const endOfDate = new Date(startOfDate);
      endOfDate.setDate(endOfDate.getDate() + 1);

      // Only query accounts that were disbursed ON OR BEFORE the selected date!
      const query = {
        companyId: req.tenantId,
        startDate: { $lt: endOfDate },
        $or: [
          { status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] } },
          { closedDate: { $gte: startOfDate } },
        ],
      };

      if (frequency) query.frequency = frequency;
      if (branchId) query.branchId = branchId;

      const accounts = await FinanceAccount.find(query)
        .populate('customerId')
        .populate({
          path: 'agentId',
          populate: { path: 'userId', select: 'name phone' },
        })
        .populate('productId', 'name frequency')
        .sort({ 'customerId.name': 1 });

      const Payment = require('../models/Payment');
      const datePayments = await Payment.find({
        companyId: req.tenantId,
        paymentDate: { $gte: startOfDate, $lt: endOfDate },
        status: 'SUCCESS',
      }).populate('collectedById', 'name email phone role');

      const paymentsByAccountId = {};
      datePayments.forEach((p) => {
        if (p.financeAccountId) {
          const accIdStr = p.financeAccountId.toString();
          if (!paymentsByAccountId[accIdStr]) {
            paymentsByAccountId[accIdStr] = [];
          }
          paymentsByAccountId[accIdStr].push(p);
        }
      });

      let sheet = accounts.map((acc) => {
        const accIdStr = acc._id.toString();
        const accPayments = paymentsByAccountId[accIdStr] || [];
        const todayPaidAmount = accPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const isPaidToday = todayPaidAmount >= (acc.installmentAmount || 0) && todayPaidAmount > 0;
        const isPartialPaidToday = todayPaidAmount > 0 && todayPaidAmount < (acc.installmentAmount || 0);

        const lastP = accPayments.length > 0 ? accPayments[accPayments.length - 1] : null;

        // Build collector info
        let collectorInfo = null;
        if (lastP && lastP.collectedById) {
          const cNames = accPayments
            .map((p) => (p.collectedById ? p.collectedById.name : ''))
            .filter(Boolean);
          const uniqueNames = [...new Set(cNames)].join(', ');

          collectorInfo = {
            id: lastP.collectedById._id ? lastP.collectedById._id.toString() : lastP.collectedById.toString(),
            name: uniqueNames || lastP.collectedById.name || 'Staff',
            role: lastP.collectedById.role || '',
          };
        }

        const isOverdue = acc.nextDueDate && new Date(acc.nextDueDate) < startOfDate;

        return {
          accountId: acc._id,
          accountNumber: acc.accountNumber,
          customer: acc.customerId,
          agent: acc.agentId,
          productName: acc.productId ? acc.productId.name : '',
          frequency: acc.frequency,
          installmentAmount: acc.installmentAmount,
          remainingAmount: acc.remainingAmount,
          startDate: acc.startDate,
          nextDueDate: acc.nextDueDate,
          isOverdue,
          status: acc.status,
          // Today's / Selected Date Status Details
          isPaidToday,
          isPartialPaidToday,
          todayPaidAmount,
          todayCollector: collectorInfo,
          todayReceiptNumber: lastP ? lastP.receiptNumber : null,
          todayPaymentTime: lastP ? lastP.paymentDate : null,
          todayPaymentMethod: lastP ? lastP.paymentMethod : null,
        };
      });

      // Resolve Agent Filtering
      const Agent = require('../models/Agent');
      let filterAgentDocId = null;
      let filterAgentUserId = null;
      let filterAgentRoutes = [];

      if (req.user.role === 'AGENT') {
        const myAgent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        if (myAgent) {
          filterAgentDocId = myAgent._id.toString();
          filterAgentUserId = req.user.id.toString();
          filterAgentRoutes = myAgent.assignedRoutes || [];
        }
      } else if (agentId) {
        const foundAgent = await Agent.findOne({
          companyId: req.tenantId,
          $or: [{ _id: agentId }, { userId: agentId }],
        });
        if (foundAgent) {
          filterAgentDocId = foundAgent._id.toString();
          filterAgentUserId = foundAgent.userId ? foundAgent.userId.toString() : agentId;
          filterAgentRoutes = foundAgent.assignedRoutes || [];
        } else {
          filterAgentDocId = agentId;
          filterAgentUserId = agentId;
        }
      }

      // Find all accounts where this agent has ever collected payments (for route attribution on tomorrow / future dates)
      let pastCollectedAccountIds = [];
      if (filterAgentDocId || filterAgentUserId) {
        const pastPayments = await Payment.find({
          companyId: req.tenantId,
          $or: [
            { collectedById: filterAgentUserId },
            { collectedById: filterAgentDocId },
            { agentId: filterAgentDocId },
            { agentId: filterAgentUserId },
          ].filter(Boolean),
          status: 'SUCCESS',
        }).distinct('financeAccountId');
        pastCollectedAccountIds = pastPayments.map((id) => id.toString());
      }

      // Apply Agent Filter
      if (req.user.role === 'AGENT') {
        const hasRoutes = filterAgentRoutes.length > 0;
        const hasAssignedAccounts = accounts.some((a) => {
          const aId = a.agentId ? (a.agentId._id ? a.agentId._id.toString() : a.agentId.toString()) : '';
          const uId = a.agentId && a.agentId.userId ? (a.agentId.userId._id ? a.agentId.userId._id.toString() : a.agentId.userId.toString()) : '';
          return aId === filterAgentDocId || uId === filterAgentUserId;
        });
        const hasPastCollections = pastCollectedAccountIds.length > 0;

        if (hasRoutes || hasAssignedAccounts || hasPastCollections) {
          sheet = sheet.filter((item) => {
            const accIdStr = item.accountId.toString();
            const assignedAgentId = item.agent?._id ? item.agent._id.toString() : '';
            const assignedUserId = item.agent?.userId?._id
              ? item.agent.userId._id.toString()
              : item.agent?.userId
              ? item.agent.userId.toString()
              : '';
            const customerAgentId = item.customer?.assignedAgentId ? item.customer.assignedAgentId.toString() : '';
            const customerRoute = item.customer?.address?.routeArea || '';

            const matchAssigned =
              assignedAgentId === filterAgentDocId ||
              assignedAgentId === filterAgentUserId ||
              assignedUserId === filterAgentDocId ||
              assignedUserId === filterAgentUserId ||
              customerAgentId === filterAgentDocId ||
              customerAgentId === filterAgentUserId;

            const matchRoute = hasRoutes && filterAgentRoutes.includes(customerRoute);

            const matchCollector = paymentsByAccountId[accIdStr]?.some((p) => {
              const pCollectorId = p.collectedById ? (p.collectedById._id ? p.collectedById._id.toString() : p.collectedById.toString()) : '';
              const pAgentId = p.agentId ? p.agentId.toString() : '';
              return pCollectorId === filterAgentDocId || pCollectorId === filterAgentUserId || pAgentId === filterAgentDocId || pAgentId === filterAgentUserId;
            });

            const matchEverCollected = pastCollectedAccountIds.includes(accIdStr);

            return matchAssigned || matchRoute || matchCollector || matchEverCollected;
          });
        }
      } else if (filterAgentDocId || filterAgentUserId) {
        // Admin / Manager filtered by a specific staff member
        sheet = sheet.filter((item) => {
          const accIdStr = item.accountId.toString();
          const assignedAgentId = item.agent?._id ? item.agent._id.toString() : '';
          const assignedUserId = item.agent?.userId?._id
            ? item.agent.userId._id.toString()
            : item.agent?.userId
            ? item.agent.userId.toString()
            : '';
          const customerAgentId = item.customer?.assignedAgentId ? item.customer.assignedAgentId.toString() : '';
          const customerRoute = item.customer?.address?.routeArea || '';

          const matchAssigned =
            assignedAgentId === filterAgentDocId ||
            assignedAgentId === filterAgentUserId ||
            assignedUserId === filterAgentDocId ||
            assignedUserId === filterAgentUserId ||
            customerAgentId === filterAgentDocId ||
            customerAgentId === filterAgentUserId;

          const matchRoute = filterAgentRoutes.length > 0 && filterAgentRoutes.includes(customerRoute);

          const matchCollector = paymentsByAccountId[accIdStr]?.some((p) => {
            const pCollectorId = p.collectedById ? (p.collectedById._id ? p.collectedById._id.toString() : p.collectedById.toString()) : '';
            const pAgentId = p.agentId ? p.agentId.toString() : '';
            return pCollectorId === filterAgentDocId || pCollectorId === filterAgentUserId || pAgentId === filterAgentDocId || pAgentId === filterAgentUserId;
          });

          const matchEverCollected = pastCollectedAccountIds.includes(accIdStr);

          return matchAssigned || matchRoute || matchCollector || matchEverCollected;
        });
      }

      // Filter by routeArea if specified
      if (routeArea) {
        sheet = sheet.filter(
          (item) => item.customer && item.customer.address && item.customer.address.routeArea === routeArea
        );
      }

      // Filter by search if specified
      if (search) {
        const s = search.toLowerCase();
        sheet = sheet.filter(
          (item) =>
            (item.customer?.name && item.customer.name.toLowerCase().includes(s)) ||
            (item.customer?.customerCode && item.customer.customerCode.toLowerCase().includes(s)) ||
            (item.customer?.phone && item.customer.phone.includes(s)) ||
            (item.accountNumber && item.accountNumber.toLowerCase().includes(s))
        );
      }

      // Filter by statusFilter if specified
      if (statusFilter === 'PAID') {
        sheet = sheet.filter((item) => item.isPaidToday);
      } else if (statusFilter === 'PENDING') {
        sheet = sheet.filter((item) => !item.isPaidToday);
      } else if (statusFilter === 'OVERDUE') {
        sheet = sheet.filter((item) => item.isOverdue && !item.isPaidToday);
      }

      const totalExpected = sheet.reduce((sum, item) => sum + (item.installmentAmount || 0), 0);
      const totalCollectedToday = sheet.reduce((sum, item) => sum + (item.todayPaidAmount || 0), 0);
      const paidCount = sheet.filter((item) => item.isPaidToday).length;
      const pendingCount = sheet.filter((item) => !item.isPaidToday).length;

      return ApiResponse.success(res, 'Collection sheet retrieved', sheet, 200, {
        selectedDate: startOfDate.toISOString(),
        totalExpected,
        totalCollectedToday,
        paidCount,
        pendingCount,
        totalBorrowers: sheet.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk Batch Collection Entry (Keyboard rapid collection submission)
   */
  static async recordBulkCollection(req, res, next) {
    try {
      const { collections = [] } = req.body;
      if (!Array.isArray(collections) || collections.length === 0) {
        throw ApiError.badRequest('Collections array is required');
      }

      const results = [];
      const errors = [];

      for (const item of collections) {
        try {
          const resItem = await CollectionService.recordCollection({
            companyId: req.tenantId,
            financeAccountId: item.financeAccountId,
            amount: item.amount,
            penaltyCollected: item.penaltyCollected || 0,
            paymentMethod: item.paymentMethod || 'CASH',
            agentId: item.agentId,
            collectedById: req.user.id,
            notes: item.notes || 'Bulk collection entry',
          });
          results.push(resItem);
        } catch (err) {
          errors.push({
            financeAccountId: item.financeAccountId,
            message: err.message,
          });
        }
      }

      return ApiResponse.success(res, `Processed ${results.length} collections. Errors: ${errors.length}`, {
        successfulCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Settle Cashier Handover
   */
  static async settleCollectionHandover(req, res, next) {
    try {
      const { collectionId, settlementStatus = 'VERIFIED_SETTLED', notes = '' } = req.body;

      const coll = await Collection.findOneAndUpdate(
        { _id: collectionId, companyId: req.tenantId },
        {
          settlementStatus,
          settledById: req.user.id,
          settledAt: new Date(),
          notes,
        },
        { new: true }
      );

      if (!coll) {
        throw ApiError.notFound('Collection record not found');
      }

      return ApiResponse.success(res, 'Collection handover settled successfully', coll);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List Today's Collections Details (All collections received today with agent attribution)
   */
  static async getTodayCollections(req, res, next) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const Payment = require('../models/Payment');
      const query = {
        companyId: req.tenantId,
        paymentDate: { $gte: today, $lt: tomorrow },
      };

      // If Field Agent, strictly show only collections collected by this agent!
      if (req.user.role === 'AGENT') {
        const Agent = require('../models/Agent');
        const myAgent = await Agent.findOne({ companyId: req.tenantId, userId: req.user.id });
        const agentDocId = myAgent ? myAgent._id : null;

        const agentConds = [{ collectedById: req.user.id }];
        if (agentDocId) agentConds.push({ agentId: agentDocId });
        query.$or = agentConds;
      }

      const payments = await Payment.find(query)
        .populate('customerId', 'name customerCode phone address')
        .populate('collectedById', 'name email phone role')
        .populate('financeAccountId', 'accountNumber remainingAmount installmentAmount frequency')
        .sort({ paymentDate: -1 });

      return ApiResponse.success(res, "Today's collections retrieved", payments);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CollectionController;
