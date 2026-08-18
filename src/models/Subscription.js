const mongoose = require('mongoose');
const { SubscriptionStatus } = require('../constants/enums');

const subscriptionSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SubscriptionStatus),
      default: SubscriptionStatus.TRIAL,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING', 'FREE_TRIAL', 'FAILED'],
      default: 'FREE_TRIAL',
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    renewalDate: {
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

subscriptionSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
