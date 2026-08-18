const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    platformName: {
      type: String,
      default: 'Finance Collection SaaS',
    },
    supportEmail: {
      type: String,
      default: 'support@financesaas.com',
    },
    supportPhone: {
      type: String,
      default: '+919876543210',
    },
    allowNewRegistrations: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    defaultTrialDays: {
      type: Number,
      default: 14,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
