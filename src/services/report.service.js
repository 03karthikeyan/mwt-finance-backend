const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const FinanceAccount = require('../models/FinanceAccount');
const Installment = require('../models/Installment');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const { FinanceStatus, InstallmentStatus } = require('../constants/enums');

class ReportService {
  /**
   * Daily Collection Summary Report
   */
  static async getDailyCollectionReport(companyId, targetDate = new Date()) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Total Collected Today
    const collectionAgg = await Payment.aggregate([
      {
        $match: {
          companyId: cid,
          paymentDate: { $gte: startOfDay, $lte: endOfDay },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: '$amount' },
          totalPenalty: { $sum: '$penaltyCollected' },
          totalTransactions: { $sum: 1 },
        },
      },
    ]);

    const collectedStats = collectionAgg[0] || { totalCollected: 0, totalPenalty: 0, totalTransactions: 0 };

    // 2. Expected Collection Today (Installments due today)
    const expectedAgg = await Installment.aggregate([
      {
        $match: {
          companyId: cid,
          dueDate: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: '$expectedAmount' },
          totalPaidOnDue: { $sum: '$paidAmount' },
          dueCount: { $sum: 1 },
        },
      },
    ]);

    const expectedStats = expectedAgg[0] || { totalExpected: 0, totalPaidOnDue: 0, dueCount: 0 };

    // 3. Overdue installments as of today
    const overdueAgg = await Installment.aggregate([
      {
        $match: {
          companyId: cid,
          dueDate: { $lt: startOfDay },
          status: { $in: [InstallmentStatus.UPCOMING, InstallmentStatus.DUE, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIALLY_PAID] },
        },
      },
      {
        $group: {
          _id: null,
          totalOverdue: { $sum: '$remainingAmount' },
          overdueCount: { $sum: 1 },
        },
      },
    ]);

    const overdueStats = overdueAgg[0] || { totalOverdue: 0, overdueCount: 0 };

    const expected = expectedStats.totalExpected;
    const collected = collectedStats.totalCollected;
    const recoveryRate = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : (collected > 0 ? 100 : 0);

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalExpected: expected,
      totalCollected: collected,
      totalPenalty: collectedStats.totalPenalty,
      totalTransactions: collectedStats.totalTransactions,
      pendingToday: Math.max(0, expected - collected),
      totalOverdueAccumulated: overdueStats.totalOverdue,
      overdueAccountsCount: overdueStats.overdueCount,
      recoveryRatePercentage: recoveryRate,
    };
  }

  /**
   * Weekly Collection Report (Last 7 Days)
   */
  static async getWeeklyCollectionReport(companyId) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyTrends = await Payment.aggregate([
      {
        $match: {
          companyId: cid,
          paymentDate: { $gte: sevenDaysAgo },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' },
          },
          collectedAmount: { $sum: '$amount' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      startDate: sevenDaysAgo.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      trends: dailyTrends.map((d) => ({
        date: d._id,
        amount: d.collectedAmount,
        transactions: d.transactions,
      })),
    };
  }

  /**
   * Monthly Collection Report (12 Months Trend)
   */
  static async getMonthlyCollectionReport(companyId) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyTrends = await Payment.aggregate([
      {
        $match: {
          companyId: cid,
          paymentDate: { $gte: twelveMonthsAgo },
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$paymentDate' },
          },
          collectedAmount: { $sum: '$amount' },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      trends: monthlyTrends.map((m) => ({
        month: m._id,
        amount: m.collectedAmount,
        transactions: m.transactions,
      })),
    };
  }

  /**
   * Agent Performance Ranking Report
   */
  static async getAgentPerformanceReport(companyId) {
    const cid = new mongoose.Types.ObjectId(companyId);

    const agentStats = await Payment.aggregate([
      {
        $match: {
          companyId: cid,
          status: 'SUCCESS',
        },
      },
      {
        $group: {
          _id: '$agentId',
          totalCollected: { $sum: '$amount' },
          totalTransactions: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'agents',
          localField: '_id',
          foreignField: '_id',
          as: 'agent',
        },
      },
      { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'agent.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          agentId: '$_id',
          agentCode: '$agent.agentCode',
          agentName: { $ifNull: ['$user.name', 'Unassigned Agent'] },
          phone: '$user.phone',
          totalCollected: 1,
          totalTransactions: 1,
          dailyTarget: '$agent.dailyTarget',
        },
      },
      { $sort: { totalCollected: -1 } },
    ]);

    return agentStats;
  }

  /**
   * Defaulter / Overdue Aging Report
   */
  static async getDefaultersReport(companyId) {
    const now = new Date();

    const overdueAccounts = await FinanceAccount.find({
      companyId,
      status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      nextDueDate: { $lt: now },
    })
      .populate('customerId', 'name phone customerCode address')
      .populate('agentId')
      .populate('productId', 'name frequency')
      .sort({ nextDueDate: 1 })
      .limit(100);

    return overdueAccounts.map((acc) => {
      const diffMs = now - new Date(acc.nextDueDate);
      const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return {
        accountId: acc._id,
        accountNumber: acc.accountNumber,
        customerName: acc.customerId ? acc.customerId.name : 'Unknown',
        customerPhone: acc.customerId ? acc.customerId.phone : '',
        customerCode: acc.customerId ? acc.customerId.customerCode : '',
        routeArea: acc.customerId && acc.customerId.address ? acc.customerId.address.routeArea : '',
        productName: acc.productId ? acc.productId.name : '',
        frequency: acc.frequency,
        totalPayable: acc.totalPayableAmount,
        totalPaid: acc.totalPaidAmount,
        remainingAmount: acc.remainingAmount,
        nextDueDate: acc.nextDueDate,
        overdueDays,
        status: acc.status,
      };
    });
  }

  /**
   * Company Executive Dashboard Metrics
   */
  static async getCompanyDashboardMetrics(companyId) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [
      totalCustomers,
      activeAccounts,
      completedAccounts,
      activeAgents,
      todayCollectionAgg,
      totalDisbursedAgg,
    ] = await Promise.all([
      Customer.countDocuments({ companyId, status: 'ACTIVE' }),
      FinanceAccount.countDocuments({ companyId, status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] } }),
      FinanceAccount.countDocuments({ companyId, status: FinanceStatus.COMPLETED }),
      Agent.countDocuments({ companyId, status: 'ACTIVE' }),
      Payment.aggregate([
        {
          $match: {
            companyId: cid,
            paymentDate: { $gte: startOfToday, $lte: endOfToday },
            status: 'SUCCESS',
          },
        },
        {
          $group: {
            _id: null,
            todayCollected: { $sum: '$amount' },
            todayTransactions: { $sum: 1 },
          },
        },
      ]),
      FinanceAccount.aggregate([
        { $match: { companyId: cid } },
        {
          $group: {
            _id: null,
            totalPrincipalDisbursed: { $sum: '$principalAmount' },
            totalPayable: { $sum: '$totalPayableAmount' },
            totalCollectedAllTime: { $sum: '$totalPaidAmount' },
            totalOutstanding: { $sum: '$remainingAmount' },
          },
        },
      ]),
    ]);

    const todayStats = todayCollectionAgg[0] || { todayCollected: 0, todayTransactions: 0 };
    const allTimeStats = totalDisbursedAgg[0] || {
      totalPrincipalDisbursed: 0,
      totalPayable: 0,
      totalCollectedAllTime: 0,
      totalOutstanding: 0,
    };

    return {
      totalCustomers,
      activeFinanceAccounts: activeAccounts,
      completedFinanceAccounts: completedAccounts,
      activeAgents,
      todayCollectedAmount: todayStats.todayCollected,
      todayTransactionsCount: todayStats.todayTransactions,
      totalPrincipalDisbursed: allTimeStats.totalPrincipalDisbursed,
      totalCollectedAllTime: allTimeStats.totalCollectedAllTime,
      totalOutstandingAmount: allTimeStats.totalOutstanding,
    };
  }
}

module.exports = ReportService;
