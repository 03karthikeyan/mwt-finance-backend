const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
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
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['EXPENSE', 'CASH_INJECTION'],
      default: 'EXPENSE',
      index: true,
    },
    category: {
      type: String,
      enum: [
        'PETROL',
        'FUEL',
        'TEA_SNACKS',
        'OFFICE_RENT',
        'OFFICE',
        'SALARY_ADVANCE',
        'SALARY',
        'STATIONERY',
        'MAINTENANCE',
        'MISC',
        'MISCELLANEOUS',
        'CAPITAL_INVESTMENT',
        'OWNER_DRAWING',
      ],
      default: 'PETROL',
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'OTHER'],
      default: 'CASH',
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'APPROVED',
      index: true,
    },
    receiptUrl: {
      type: String,
      default: '',
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

expenseSchema.index({ companyId: 1, date: -1 });

module.exports = mongoose.model('Expense', expenseSchema);
