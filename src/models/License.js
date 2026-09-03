const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    licenseKey: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    licenseType: {
      type: String,
      enum: ['LIFETIME'],
      default: 'LIFETIME',
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    lifetimeStatus: {
      type: String,
      enum: ['ACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    // Annual Service & Maintenance Charge
    serviceStartDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    serviceExpiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    gracePeriodDays: {
      type: Number,
      default: 15,
    },
    annualMaintenanceFee: {
      type: Number,
      default: 5000, // Annual charge for server/cloud/SMS/support maintenance
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'GRACE_PERIOD', 'SERVICE_EXPIRED', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    lastRenewalDate: {
      type: Date,
    },
    renewalHistory: [
      {
        renewalDate: { type: Date, default: Date.now },
        serviceStartDate: { type: Date },
        serviceExpiryDate: { type: Date },
        amountPaid: { type: Number, required: true },
        paymentMethod: { type: String, default: 'BANK_TRANSFER' },
        transactionRef: { type: String, default: '' },
        invoiceNo: { type: String, default: '' },
        notes: { type: String, default: '' },
      },
    ],
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

licenseSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('License', licenseSchema);
