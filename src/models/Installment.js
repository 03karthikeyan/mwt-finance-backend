const mongoose = require('mongoose');
const { InstallmentStatus } = require('../constants/enums');

const installmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    financeAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceAccount',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    installmentNumber: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    expectedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
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
    paidDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: Object.values(InstallmentStatus),
      default: InstallmentStatus.UPCOMING,
      index: true,
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

installmentSchema.index({ companyId: 1, financeAccountId: 1, installmentNumber: 1 }, { unique: true });
installmentSchema.index({ companyId: 1, customerId: 1, status: 1 });
installmentSchema.index({ companyId: 1, dueDate: 1, status: 1 });

module.exports = mongoose.model('Installment', installmentSchema);
