const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    collectionDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    routeArea: {
      type: String,
      default: '',
      index: true,
    },
    expectedAmount: {
      type: Number,
      default: 0,
    },
    collectedAmount: {
      type: Number,
      default: 0,
    },
    pendingAmount: {
      type: Number,
      default: 0,
    },
    penaltiesCollected: {
      type: Number,
      default: 0,
    },
    totalCustomersCount: {
      type: Number,
      default: 0,
    },
    paidCustomersCount: {
      type: Number,
      default: 0,
    },
    pendingCustomersCount: {
      type: Number,
      default: 0,
    },
    settlementStatus: {
      type: String,
      enum: ['PENDING_HANDOVER', 'VERIFIED_SETTLED', 'DISCREPANCY'],
      default: 'PENDING_HANDOVER',
    },
    settledById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    settledAt: {
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

collectionSchema.index({ companyId: 1, agentId: 1, collectionDate: 1 });
collectionSchema.index({ companyId: 1, collectionDate: 1, routeArea: 1 });

module.exports = mongoose.model('Collection', collectionSchema);
