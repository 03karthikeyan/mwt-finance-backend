const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');
const { NotificationType } = require('../constants/enums');

class PushNotificationService {
  /**
   * Register or Refresh FCM Device Token for a User
   */
  static async registerDeviceToken({
    userId,
    companyId,
    role,
    fcmToken,
    platform = 'android',
    deviceId = '',
    deviceModel = '',
    appVersion = '1.0.0',
  }) {
    if (!userId || !fcmToken) return null;

    const tokenDoc = await DeviceToken.findOneAndUpdate(
      { userId, fcmToken },
      {
        userId,
        companyId,
        role,
        fcmToken,
        platform,
        deviceId,
        deviceModel,
        appVersion,
        lastActive: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(`[PUSH] 📲 Device token registered for user: ${userId} (${role} on ${platform})`);
    return tokenDoc;
  }

  /**
   * Unregister Device Token on Logout
   */
  static async unregisterDeviceToken({ userId, fcmToken }) {
    if (!userId) return null;
    if (fcmToken) {
      await DeviceToken.deleteOne({ userId, fcmToken });
    } else {
      await DeviceToken.deleteMany({ userId });
    }
    console.log(`[PUSH] 📴 Device token removed for user: ${userId}`);
    return true;
  }

  /**
   * Send Push Notification to a specific User
   */
  static async sendToUser({
    recipientId,
    companyId = null,
    title,
    message,
    type = NotificationType.SYSTEM,
    data = {},
  }) {
    if (!recipientId || !title || !message) return null;

    try {
      // 1. Create In-App Persistent Notification Record
      const notification = new Notification({
        companyId,
        recipientId,
        title,
        message,
        type,
        data,
        isRead: false,
      });
      await notification.save();

      // 2. Fetch User's Active Device Tokens for Push
      const deviceTokens = await DeviceToken.find({ userId: recipientId });
      const fcmTokens = deviceTokens.map((d) => d.fcmToken).filter(Boolean);

      console.log(`[PUSH] 🔔 Notification sent to user ${recipientId} [${type}]: "${title}" (${fcmTokens.length} push devices)`);

      // 3. Dispatch to Firebase Cloud Messaging (if Firebase is configured)
      if (global.firebaseMessaging && fcmTokens.length > 0) {
        try {
          const response = await global.firebaseMessaging.sendEachForMulticast({
            tokens: fcmTokens,
            notification: { title, body: message },
            data: {
              ...Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
              ),
              notificationId: notification._id.toString(),
              type: type.toString(),
            },
          });

          // Clean up invalid / unregistered tokens
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                DeviceToken.deleteOne({ fcmToken: fcmTokens[idx] }).exec();
              }
            });
          }
        } catch (fcmErr) {
          console.warn('[PUSH] FCM dispatch warning:', fcmErr.message);
        }
      }

      return notification;
    } catch (err) {
      console.error('[PUSH ERROR] Failed to send push notification:', err);
      return null;
    }
  }

  /**
   * Broadcast Push Notification to all users in a specific role (e.g. All Admins or All Agents)
   */
  static async sendToRole({
    companyId,
    role,
    title,
    message,
    type = NotificationType.SYSTEM,
    data = {},
  }) {
    if (!companyId || !role || !title || !message) return [];

    try {
      const users = await User.find({ companyId, role, status: 'ACTIVE' }).select('_id');
      const results = await Promise.all(
        users.map((u) =>
          this.sendToUser({
            recipientId: u._id,
            companyId,
            title,
            message,
            type,
            data,
          })
        )
      );
      return results;
    } catch (err) {
      console.error('[PUSH ERROR] Failed to send to role:', err);
      return [];
    }
  }

  /**
   * Event Trigger: Instant Collection Alert to Company Admins
   */
  static async notifyPaymentCollected({
    companyId,
    collectorName,
    customerName,
    amount,
    receiptNo,
    accountNumber,
  }) {
    const title = `💰 Collection Received: ₹${amount}`;
    const message = `${collectorName} collected ₹${amount} from ${customerName} (${receiptNo})`;

    return this.sendToRole({
      companyId,
      role: 'COMPANY_ADMIN',
      title,
      message,
      type: NotificationType.PAYMENT,
      data: {
        amount: amount.toString(),
        receiptNo: receiptNo || '',
        customerName: customerName || '',
        accountNumber: accountNumber || '',
        event: 'PAYMENT_COLLECTED',
      },
    });
  }

  /**
   * Event Trigger: Loan Disbursement Alert to Assigned Field Agent
   */
  static async notifyLoanDisbursed({
    companyId,
    agentUserId,
    customerName,
    principalAmount,
    accountNumber,
    installmentAmount,
  }) {
    const title = `📋 New Loan Assigned: ${customerName}`;
    const message = `Loan ${accountNumber} (₹${principalAmount}) has been disbursed. Daily collection: ₹${installmentAmount}/day.`;

    return this.sendToUser({
      recipientId: agentUserId,
      companyId,
      title,
      message,
      type: NotificationType.SYSTEM,
      data: {
        accountNumber: accountNumber || '',
        customerName: customerName || '',
        principalAmount: principalAmount.toString(),
        event: 'LOAN_DISBURSED',
      },
    });
  }
}

module.exports = PushNotificationService;
