const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    branchCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    phone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: 'Tamil Nadu' },
      pincode: { type: String, default: '' },
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

branchSchema.index({ companyId: 1, branchCode: 1 }, { unique: true });
branchSchema.index({ companyId: 1, status: 1 });
branchSchema.index({ companyId: 1, 'address.district': 1 });

module.exports = mongoose.model('Branch', branchSchema);
