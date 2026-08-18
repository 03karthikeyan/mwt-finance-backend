const mongoose = require('mongoose');
const FinanceAccount = require('../models/FinanceAccount');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const PaymentAllocation = require('../models/PaymentAllocation');
const Receipt = require('../models/Receipt');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const Collection = require('../models/Collection');
const Company = require('../models/Company');
const ApiError = require('../utils/apiError');
const { FinanceStatus, InstallmentStatus, PaymentStatus } = require('../constants/enums');

class CollectionService {
  /**
   * Process a collection payment atomically
   */
  static async recordCollection({
    companyId,
    financeAccountId,
    amount,
    penaltyCollected = 0,
    paymentMethod = 'CASH',
    transactionReference = '',
    agentId,
    collectedById,
    customerLocation,
    notes = '',
    idempotencyKey,
  }) {
    const paymentAmount = Number(amount);
    const penaltyAmount = Number(penaltyCollected || 0);

    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      throw ApiError.badRequest('Collection amount must be greater than 0');
    }

    // Check Idempotency to prevent double-submit
    if (idempotencyKey) {
      const existingPayment = await Payment.findOne({ companyId, idempotencyKey });
      if (existingPayment) {
        const existingReceipt = await Receipt.findOne({ companyId, paymentId: existingPayment._id });
        return {
          payment: existingPayment,
          receipt: existingReceipt,
          isDuplicate: true,
        };
      }
    }

    // Find Finance Account
    const account = await FinanceAccount.findOne({ _id: financeAccountId, companyId });
    if (!account) {
      throw ApiError.notFound('Finance account not found in this company');
    }

    if (![FinanceStatus.ACTIVE, FinanceStatus.OVERDUE].includes(account.status)) {
      throw ApiError.badRequest(`Cannot collect payment for an account with status '${account.status}'`);
    }

    if (paymentAmount > account.remainingAmount) {
      throw ApiError.badRequest(
        `Payment amount (${paymentAmount}) exceeds the remaining balance (${account.remainingAmount})`
      );
    }

    // Fetch company details for receipt
    const company = await Company.findById(companyId);
    const customer = await Customer.findOne({ _id: account.customerId, companyId });
    const agent = await Agent.findOne({ _id: agentId || account.agentId, companyId }).populate('userId', 'name phone');

    // Generate unique payment & receipt numbers
    const timestamp = Date.now().toString().slice(-6);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const paymentNumber = `PAY-${timestamp}-${randomSuffix}`;
    const receiptNumber = `REC-${timestamp}-${randomSuffix}`;

    const totalCollectedForPayment = paymentAmount + penaltyAmount;
    const previousBalance = account.remainingAmount;

    // 1. Create Payment Record
    const payment = new Payment({
      companyId,
      branchId: account.branchId,
      paymentNumber,
      receiptNumber,
      financeAccountId: account._id,
      customerId: customer._id,
      agentId: agent ? agent._id : account.agentId,
      collectedById,
      amount: paymentAmount,
      penaltyCollected: penaltyAmount,
      totalAmount: totalCollectedForPayment,
      paymentMethod,
      transactionReference,
      paymentDate: new Date(),
      status: PaymentStatus.SUCCESS,
      idempotencyKey: idempotencyKey || null,
      customerLocation: customerLocation || null,
      notes,
    });
    await payment.save();

    // 2. Allocate payment across unpaid installments (FIFO)
    const unpaidInstallments = await Installment.find({
      companyId,
      financeAccountId: account._id,
      status: { $in: [InstallmentStatus.UPCOMING, InstallmentStatus.DUE, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIALLY_PAID] },
    }).sort({ installmentNumber: 1 });

    let unallocatedAmount = paymentAmount;
    const allocations = [];
    let completedInstallmentsCount = 0;

    for (const inst of unpaidInstallments) {
      if (unallocatedAmount <= 0) break;

      const instRemaining = inst.expectedAmount - inst.paidAmount;
      const amountToApply = Math.min(unallocatedAmount, instRemaining);

      inst.paidAmount += amountToApply;
      inst.remainingAmount = inst.expectedAmount - inst.paidAmount;

      if (inst.remainingAmount <= 0) {
        inst.status = InstallmentStatus.PAID;
        inst.paidDate = new Date();
        completedInstallmentsCount++;
      } else {
        inst.status = InstallmentStatus.PARTIALLY_PAID;
      }

      await inst.save();

      const alloc = new PaymentAllocation({
        companyId,
        paymentId: payment._id,
        installmentId: inst._id,
        financeAccountId: account._id,
        allocatedAmount: amountToApply,
        penaltyAllocated: 0,
      });
      await alloc.save();
      allocations.push(alloc);

      unallocatedAmount -= amountToApply;
    }

    // 3. Update Finance Account
    account.totalPaidAmount += paymentAmount;
    account.remainingAmount = Math.max(0, account.totalPayableAmount - account.totalPaidAmount);
    account.paidInstallments += completedInstallmentsCount;

    if (account.remainingAmount === 0) {
      account.status = FinanceStatus.COMPLETED;
      account.closedDate = new Date();
      account.nextDueDate = null;
    } else {
      // Find next due installment
      const nextInst = await Installment.findOne({
        companyId,
        financeAccountId: account._id,
        status: { $in: [InstallmentStatus.UPCOMING, InstallmentStatus.DUE, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIALLY_PAID] },
      }).sort({ installmentNumber: 1 });

      if (nextInst) {
        account.nextDueDate = nextInst.dueDate;
      }
    }
    await account.save();

    // 4. Update Customer Ledger Totals
    if (customer) {
      customer.totalPaidAmount = (customer.totalPaidAmount || 0) + paymentAmount;
      customer.totalOutstandingAmount = Math.max(0, (customer.totalOutstandingAmount || 0) - paymentAmount);
      if (account.status === FinanceStatus.COMPLETED && customer.totalActiveLoans > 0) {
        customer.totalActiveLoans -= 1;
      }
      await customer.save();
    }

    // 5. Update Agent Stats
    if (agent) {
      agent.totalCollected = (agent.totalCollected || 0) + paymentAmount;
      await agent.save();
    }

    // 6. Generate WhatsApp Receipt Text
    const agentName = agent && agent.userId ? agent.userId.name : 'Collection Agent';
    const formattedWhatsAppMessage = 
      `*${company ? company.name : 'FINANCE RECEIPT'}*\n` +
      `--------------------------------\n` +
      `*Receipt No:* ${receiptNumber}\n` +
      `*Date:* ${new Date().toLocaleDateString('en-GB')}\n` +
      `*Customer:* ${customer ? customer.name : 'Customer'} (${customer ? customer.customerCode : ''})\n` +
      `*Account No:* ${account.accountNumber}\n` +
      `*Amount Paid:* ₹${paymentAmount.toLocaleString('en-IN')}\n` +
      `*Payment Mode:* ${paymentMethod}\n` +
      `*Previous Balance:* ₹${previousBalance.toLocaleString('en-IN')}\n` +
      `*Remaining Balance:* ₹${account.remainingAmount.toLocaleString('en-IN')}\n` +
      `*Collected By:* ${agentName}\n` +
      `--------------------------------\n` +
      `_Thank you for your timely payment!_`;

    // 7. Create Receipt Record
    const receipt = new Receipt({
      companyId,
      receiptNumber,
      paymentId: payment._id,
      customerId: customer._id,
      financeAccountId: account._id,
      customerName: customer ? customer.name : '',
      customerPhone: customer ? customer.phone : '',
      customerCode: customer ? customer.customerCode : '',
      accountNumber: account.accountNumber,
      agentName,
      agentCode: agent ? agent.agentCode : '',
      companyName: company ? company.name : '',
      companyPhone: company ? company.phone : '',
      amountPaid: paymentAmount,
      penaltyPaid: penaltyAmount,
      totalPaid: totalCollectedForPayment,
      paymentMethod,
      paymentDate: new Date(),
      previousBalance,
      remainingBalance: account.remainingAmount,
      formattedWhatsAppMessage,
      status: 'ISSUED',
    });
    await receipt.save();

    // 8. Update / Upsert Daily Collection Log
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    if (agent) {
      await Collection.findOneAndUpdate(
        {
          companyId,
          agentId: agent._id,
          collectionDate: { $gte: startOfToday, $lte: endOfToday },
        },
        {
          $inc: {
            collectedAmount: paymentAmount,
            penaltiesCollected: penaltyAmount,
            paidCustomersCount: 1,
          },
          $setOnInsert: {
            companyId,
            branchId: account.branchId,
            agentId: agent._id,
            collectionDate: new Date(),
            routeArea: (customer && customer.address) ? customer.address.routeArea : 'General',
            settlementStatus: 'PENDING_HANDOVER',
          },
        },
        { upsert: true, new: true }
      );
    }

    return {
      payment,
      receipt,
      account: {
        id: account._id,
        accountNumber: account.accountNumber,
        totalPaidAmount: account.totalPaidAmount,
        remainingAmount: account.remainingAmount,
        status: account.status,
        nextDueDate: account.nextDueDate,
      },
    };
  }
}

module.exports = CollectionService;
