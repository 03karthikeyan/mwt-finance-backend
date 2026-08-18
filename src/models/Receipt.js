const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    receiptNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    financeAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinanceAccount',
      required: true,
      index: true,
    },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerCode: { type: String, required: true },
    accountNumber: { type: String, required: true },
    agentName: { type: String, required: true },
    agentCode: { type: String, default: '' },
    companyName: { type: String, required: true },
    companyPhone: { type: String, default: '' },
    amountPaid: { type: Number, required: true },
    penaltyPaid: { type: Number, default: 0 },
    totalPaid: { type: Number, required: true },
    paymentMethod: { type: String, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    previousBalance: { type: Number, required: true },
    remainingBalance: { type: Number, required: true },
    formattedWhatsAppMessage: { type: String, default: '' },
    status: {
      type: String,
      enum: ['ISSUED', 'CANCELLED'],
      default: 'ISSUED',
    },
  },
  {
    timestamps: true,
  }
);

receiptSchema.index({ companyId: 1, receiptNumber: 1 }, { unique: true });
receiptSchema.index({ companyId: 1, paymentDate: 1 });

module.exports = mongoose.model('Receipt', receiptSchema);
