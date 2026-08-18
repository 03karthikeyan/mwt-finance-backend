const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    companyCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      index: true,
    },
    logo: {
      type: String,
      default: '',
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: 'Tamil Nadu' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    registrationNumber: {
      type: String,
      default: '',
    },
    taxNumber: {
      type: String,
      default: '',
    },
    supportPhone: {
      type: String,
      default: '',
    },
    supportEmail: {
      type: String,
      default: '',
    },
    receiptFooterNote: {
      type: String,
      default: 'Thank you for your timely repayment! Please collect physical/digital receipt for every installment.',
    },
    currency: {
      code: { type: String, default: 'INR' },
      symbol: { type: String, default: '₹' },
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    workingDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'],
      default: 'ACTIVE',
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
    },
  },
  {
    timestamps: true,
  }
);

companySchema.index({ name: 'text', companyCode: 'text', email: 'text', phone: 'text' });

module.exports = mongoose.model('Company', companySchema);
