const mongoose = require('mongoose');

const companySettingsSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    receiptSettings: {
      headerText: { type: String, default: 'Finance Installment Receipt' },
      footerText: { type: String, default: 'Thank you for your timely payment!' },
      showAgentPhone: { type: Boolean, default: true },
      showCompanyAddress: { type: Boolean, default: true },
      termsAndConditions: { type: String, default: 'Payments once made are non-refundable.' },
    },
    financeSettings: {
      defaultGracePeriodDays: { type: Number, default: 2 },
      allowPartialPayments: { type: Boolean, default: true },
      autoCalculatePenalty: { type: Boolean, default: false },
      dailyCutoffTime: { type: String, default: '21:00' }, // 9 PM
    },
    notificationSettings: {
      enableWhatsAppNotifications: { type: Boolean, default: true },
      enableSmsNotifications: { type: Boolean, default: false },
      enablePushNotifications: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CompanySettings', companySettingsSchema);
