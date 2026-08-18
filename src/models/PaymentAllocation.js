const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    installmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installment',
      required: true,
      index: true,
    },
    financeAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceAccount',
      required: true,
    },
    allocatedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    penaltyAllocated: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

paymentAllocationSchema.index({ companyId: 1, paymentId: 1 });

module.exports = mongoose.model('PaymentAllocation', paymentAllocationSchema);
