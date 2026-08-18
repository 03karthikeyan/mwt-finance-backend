const mongoose = require('mongoose');
const { CollectionFrequency, FinanceStatus } = require('../constants/enums');

const financeAccountSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    accountNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceProduct',
      required: true,
      index: true,
    },
    frequency: {
      type: String,
      enum: Object.values(CollectionFrequency),
      required: true,
      index: true,
    },
    principalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    interestAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    docChargeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    netDisbursedAmount: {
      type: Number,
      required: true,
    },
    totalPayableAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    installmentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalInstallments: {
      type: Number,
      required: true,
      min: 1,
    },
    paidInstallments: {
      type: Number,
      default: 0,
    },
    totalPaidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    penaltyAmount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: true,
    },
    nextDueDate: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(FinanceStatus),
      default: FinanceStatus.ACTIVE,
      index: true,
    },
    disbursedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    closedDate: {
      type: Date,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

financeAccountSchema.index({ companyId: 1, accountNumber: 1 }, { unique: true });
financeAccountSchema.index({ companyId: 1, customerId: 1, status: 1 });
financeAccountSchema.index({ companyId: 1, agentId: 1, status: 1 });
financeAccountSchema.index({ companyId: 1, nextDueDate: 1, status: 1 });
financeAccountSchema.index({ companyId: 1, frequency: 1, status: 1 });

module.exports = mongoose.model('FinanceAccount', financeAccountSchema);
