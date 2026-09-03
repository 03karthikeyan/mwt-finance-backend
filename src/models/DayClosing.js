const mongoose = require('mongoose');

const dayClosingSchema = new mongoose.Schema(
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
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    openingCash: {
      type: Number,
      default: 0,
    },
    cashCollected: {
      type: Number,
      required: true,
      default: 0,
    },
    onlineCollected: {
      type: Number,
      default: 0,
    },
    expensesAmount: {
      type: Number,
      default: 0,
    },
    cashAdvances: {
      type: Number,
      default: 0,
    },
    expectedClosingCash: {
      type: Number,
      required: true,
    },
    actualCashSubmitted: {
      type: Number,
      required: true,
    },
    shortageOrExcess: {
      type: Number, // positive = excess, negative = shortage
      default: 0,
    },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'VERIFIED', 'DISCREPANCY_FLAGGED'],
      default: 'PENDING_VERIFICATION',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verificationDate: {
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

dayClosingSchema.index({ companyId: 1, agentId: 1, date: -1 });

module.exports = mongoose.model('DayClosing', dayClosingSchema);
