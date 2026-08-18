const mongoose = require('mongoose');
const { NotificationType } = require('../constants/enums');

const notificationSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null, // Null for Super Admin global notifications
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      default: NotificationType.SYSTEM,
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
