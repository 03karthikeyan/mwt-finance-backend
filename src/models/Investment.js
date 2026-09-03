const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema(
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
    investorName: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['CAPITAL_INFLOW', 'PROFIT_WITHDRAWAL', 'PARTNER_DRAWING', 'REPAYMENT'],
      default: 'CAPITAL_INFLOW',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    investmentDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paymentMode: {
      type: String,
      enum: ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI'],
      default: 'BANK_TRANSFER',
    },
    referenceNo: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

investmentSchema.index({ companyId: 1, investmentDate: -1 });

module.exports = mongoose.model('Investment', investmentSchema);
