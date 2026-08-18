const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
      index: true,
    },
    role: {
      type: String,
      default: 'AGENT',
      index: true,
    },
    fcmToken: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'unknown'],
      default: 'android',
    },
    deviceId: {
      type: String,
      default: '',
    },
    deviceModel: {
      type: String,
      default: '',
    },
    appVersion: {
      type: String,
      default: '1.0.0',
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index so a user token is unique per device
deviceTokenSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });
deviceTokenSchema.index({ companyId: 1, role: 1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
