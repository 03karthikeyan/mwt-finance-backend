const mongoose = require('mongoose');
const { PaymentMethod, PaymentStatus } = require('../constants/enums');

const paymentSchema = new mongoose.Schema(
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
    paymentNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    receiptNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
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
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true,
    },
    collectedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    penaltyCollected: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.CASH,
      index: true,
    },
    transactionReference: {
      type: String,
      default: '',
    },
    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.SUCCESS,
      index: true,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      index: true,
    },
    customerLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
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

paymentSchema.index({ companyId: 1, paymentNumber: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, receiptNumber: 1 }, { unique: true });
paymentSchema.index({ companyId: 1, paymentDate: 1, status: 1 });
paymentSchema.index({ companyId: 1, agentId: 1, paymentDate: 1 });
paymentSchema.index({ companyId: 1, customerId: 1, paymentDate: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
