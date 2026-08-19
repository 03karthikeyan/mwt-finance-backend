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
  static async getDailyCollectionReport(companyId, targetDate = new Date(), branchId = null) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const bid = branchId && mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null;
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const paymentMatch = {
      companyId: cid,
      paymentDate: { $gte: startOfDay, $lte: endOfDay },
      status: 'SUCCESS',
    };
    if (bid) paymentMatch.branchId = bid;

    // 1. Total Collected Today
    const collectionAgg = await Payment.aggregate([
      { $match: paymentMatch },
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
    const expectedPipeline = [
      {
        $match: {
          companyId: cid,
          dueDate: { $gte: startOfDay, $lte: endOfDay },
        },
      },
    ];

    if (bid) {
      expectedPipeline.push(
        {
          $lookup: {
            from: 'financeaccounts',
            localField: 'financeAccountId',
            foreignField: '_id',
            as: 'account',
          },
        },
        { $unwind: '$account' },
        { $match: { 'account.branchId': bid } }
      );
    }

    expectedPipeline.push({
      $group: {
        _id: null,
        totalExpected: { $sum: '$expectedAmount' },
        totalPaidOnDue: { $sum: '$paidAmount' },
        dueCount: { $sum: 1 },
      },
    });

    const expectedAgg = await Installment.aggregate(expectedPipeline);
    const expectedStats = expectedAgg[0] || { totalExpected: 0, totalPaidOnDue: 0, dueCount: 0 };

    // 3. Overdue installments as of today
    const overduePipeline = [
      {
        $match: {
          companyId: cid,
          dueDate: { $lt: startOfDay },
          status: { $in: [InstallmentStatus.UPCOMING, InstallmentStatus.DUE, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIALLY_PAID] },
        },
      },
    ];

    if (bid) {
      overduePipeline.push(
        {
          $lookup: {
            from: 'financeaccounts',
            localField: 'financeAccountId',
            foreignField: '_id',
            as: 'account',
          },
        },
        { $unwind: '$account' },
        { $match: { 'account.branchId': bid } }
      );
    }

    overduePipeline.push({
      $group: {
        _id: null,
        totalOverdue: { $sum: '$remainingAmount' },
        overdueCount: { $sum: 1 },
      },
    });

    const overdueAgg = await Installment.aggregate(overduePipeline);
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
  static async getWeeklyCollectionReport(companyId, branchId = null) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const bid = branchId && mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const matchCond = {
      companyId: cid,
      paymentDate: { $gte: sevenDaysAgo },
      status: 'SUCCESS',
    };
    if (bid) matchCond.branchId = bid;

    const dailyTrends = await Payment.aggregate([
      { $match: matchCond },
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
  static async getMonthlyCollectionReport(companyId, branchId = null) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const bid = branchId && mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const matchCond = {
      companyId: cid,
      paymentDate: { $gte: twelveMonthsAgo },
      status: 'SUCCESS',
    };
    if (bid) matchCond.branchId = bid;

    const monthlyTrends = await Payment.aggregate([
      { $match: matchCond },
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
  static async getAgentPerformanceReport(companyId, branchId = null) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const bid = branchId && mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null;

    const matchCond = {
      companyId: cid,
      status: 'SUCCESS',
    };
    if (bid) matchCond.branchId = bid;

    const agentStats = await Payment.aggregate([
      { $match: matchCond },
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
  static async getDefaultersReport(companyId, branchId = null) {
    const now = new Date();
    const query = {
      companyId,
      status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] },
      nextDueDate: { $lt: now },
    };
    if (branchId) query.branchId = branchId;

    const overdueAccounts = await FinanceAccount.find(query)
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
  static async getCompanyDashboardMetrics(companyId, branchId = null) {
    const cid = new mongoose.Types.ObjectId(companyId);
    const bid = branchId && mongoose.Types.ObjectId.isValid(branchId) ? new mongoose.Types.ObjectId(branchId) : null;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const custQuery = { companyId, status: 'ACTIVE' };
    const actAccQuery = { companyId, status: { $in: [FinanceStatus.ACTIVE, FinanceStatus.OVERDUE] } };
    const compAccQuery = { companyId, status: FinanceStatus.COMPLETED };
    const agentQuery = { companyId, status: 'ACTIVE' };

    if (bid) {
      custQuery.branchId = bid;
      actAccQuery.branchId = bid;
      compAccQuery.branchId = bid;
      agentQuery.branchId = bid;
    }

    const payMatch = {
      companyId: cid,
      paymentDate: { $gte: startOfToday, $lte: endOfToday },
      status: 'SUCCESS',
    };
    if (bid) payMatch.branchId = bid;

    const finMatch = { companyId: cid };
    if (bid) finMatch.branchId = bid;

    const [
      totalCustomers,
      activeAccounts,
      completedAccounts,
      activeAgents,
      todayCollectionAgg,
      totalDisbursedAgg,
    ] = await Promise.all([
      Customer.countDocuments(custQuery),
      FinanceAccount.countDocuments(actAccQuery),
      FinanceAccount.countDocuments(compAccQuery),
      Agent.countDocuments(agentQuery),
      Payment.aggregate([
        { $match: payMatch },
        {
          $group: {
            _id: null,
            todayCollected: { $sum: '$amount' },
            todayTransactions: { $sum: 1 },
          },
        },
      ]),
      FinanceAccount.aggregate([
        { $match: finMatch },
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
