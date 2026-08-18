const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
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
    employeeId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    designation: {
      type: String,
      default: 'Collection Officer',
    },
    department: {
      type: String,
      default: 'Finance',
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

staffSchema.index({ companyId: 1, employeeId: 1 }, { unique: true });

module.exports = mongoose.model('Staff', staffSchema);
