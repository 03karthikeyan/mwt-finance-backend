const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
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
    assignedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // If customer has login enabled
      index: true,
    },
    customerCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: [true, 'Customer phone is required'],
      trim: true,
      index: true,
    },
    alternatePhone: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      routeArea: { type: String, default: '', index: true }, // e.g. Line 1 - Market
      latitude: { type: Number },
      longitude: { type: Number },
    },
    guarantor: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      relation: { type: String, default: '' },
      address: { type: String, default: '' },
    },
    identityProof: {
      idType: { type: String, default: 'Aadhaar / National ID' },
      idNumber: { type: String, default: '' },
    },
    profileImage: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'BLOCKED'],
      default: 'ACTIVE',
      index: true,
    },
    creditLimit: {
      type: Number,
      default: 100000,
    },
    totalActiveLoans: {
      type: Number,
      default: 0,
    },
    totalPaidAmount: {
      type: Number,
      default: 0,
    },
    totalOutstandingAmount: {
      type: Number,
      default: 0,
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

customerSchema.index({ companyId: 1, customerCode: 1 }, { unique: true });
customerSchema.index({ companyId: 1, phone: 1 });
customerSchema.index({ companyId: 1, assignedAgentId: 1, status: 1 });
customerSchema.index({ companyId: 1, 'address.routeArea': 1 });
customerSchema.index({ name: 'text', customerCode: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
