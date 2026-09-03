const mongoose = require('mongoose');
const { CollectionFrequency } = require('../constants/enums');

const financeProductSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    productCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    frequency: {
      type: String,
      enum: Object.values(CollectionFrequency),
      required: true,
      default: CollectionFrequency.DAILY,
      index: true,
    },
    calculationType: {
      type: String,
      enum: ['FLAT_INTEREST', 'DOCUMENTATION_FEE_DEDUCTION', 'REDUCING_BALANCE', 'FIXED_INSTALLMENT', 'INTEREST_ONLY'],
      default: 'DOCUMENTATION_FEE_DEDUCTION',
    },
    productCategory: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY_EMI', 'MONTHLY_INTEREST', 'GOLD_LOAN', 'VEHICLE_FINANCE', 'ENTERPRISE_LOAN', 'PRODUCT_FINANCE'],
      default: 'DAILY',
      index: true,
    },
    minAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 1000,
    },
    maxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 500000,
    },
    defaultInstallments: {
      type: Number,
      required: true,
      default: 100, // e.g. 100 days for daily, 10 weeks for weekly
    },
    interestPercentage: {
      type: Number,
      default: 0, // 0 if pure doc fee microfinance
    },
    docChargePercentage: {
      type: Number,
      default: 5, // e.g. 5% deducted upfront
    },
    docChargeFixed: {
      type: Number,
      default: 0,
    },
    deductChargesUpfront: {
      type: Boolean,
      default: true,
    },
    lateFeePerDay: {
      type: Number,
      default: 0,
    },
    gracePeriodDays: {
      type: Number,
      default: 1,
    },
    excludeHolidays: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

financeProductSchema.index({ companyId: 1, productCode: 1 }, { unique: true });
financeProductSchema.index({ companyId: 1, frequency: 1, status: 1 });

module.exports = mongoose.model('FinanceProduct', financeProductSchema);
