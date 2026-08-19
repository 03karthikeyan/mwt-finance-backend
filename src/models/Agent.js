const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
      index: true,
    },
    agentCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    assignedRoutes: {
      type: [String],
      default: [], // e.g. ['Line 1 - Central Market', 'Line 2 - East Street']
    },
    dailyTarget: {
      type: Number,
      default: 0,
    },
    commissionPercentage: {
      type: Number,
      default: 0,
    },
    totalCollected: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    profileImage: {
      type: String,
      default: '',
    },
    proofType: {
      type: String,
      default: 'Aadhaar Card',
    },
    proofNumber: {
      type: String,
      default: '',
    },
    emergencyContact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: 'Tamil Nadu' },
      pincode: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

agentSchema.index({ companyId: 1, agentCode: 1 }, { unique: true });
agentSchema.index({ companyId: 1, userId: 1 }, { unique: true });
agentSchema.index({ companyId: 1, branchId: 1, status: 1 });
agentSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('Agent', agentSchema);
