const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMonths: {
      type: Number,
      required: true,
      default: 1,
    },
    maxUsers: {
      type: Number,
      default: 10,
    },
    maxAgents: {
      type: Number,
      default: 5,
    },
    maxCustomers: {
      type: Number,
      default: 500,
    },
    maxBranches: {
      type: Number,
      default: 2,
    },
    features: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
