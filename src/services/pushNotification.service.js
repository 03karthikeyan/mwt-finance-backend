const Notification = require('../models/Notification');
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');
const { NotificationType } = require('../constants/enums');
const { getMessaging } = require('../config/firebase');
const logger = require('../utils/logger');

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

    try {
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

      logger.info(`[PUSH] 📲 Device token registered for user: ${userId} (${role} on ${platform})`);
      return tokenDoc;
    } catch (err) {
      logger.error(`[PUSH ERROR] Failed to register device token: ${err.message}`);
      return null;
    }
  }

  /**
   * Unregister Device Token on Logout
   */
  static async unregisterDeviceToken({ userId, fcmToken }) {
    if (!userId) return null;
    try {
      if (fcmToken) {
        await DeviceToken.deleteOne({ userId, fcmToken });
      } else {
        await DeviceToken.deleteMany({ userId });
      }
      logger.info(`[PUSH] 📴 Device token removed for user: ${userId}`);
      return true;
    } catch (err) {
      logger.error(`[PUSH ERROR] Failed to unregister device token: ${err.message}`);
      return false;
    }
  }

  /**
   * Send Push Notification to a specific User (In-App Database + Firebase Cloud Messaging)
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
      // 1. Create In-App Persistent Notification Record in MongoDB
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

      logger.info(
        `[PUSH] 🔔 Notification created for user ${recipientId} [${type}]: "${title}" (${fcmTokens.length} push devices)`
      );

      // 3. Dispatch to Firebase Cloud Messaging (if Firebase is configured and devices exist)
      const messaging = getMessaging();
      if (messaging && fcmTokens.length > 0) {
        try {
          const stringifiedData = Object.fromEntries(
            Object.entries(data || {}).map(([k, v]) => [
              k,
              typeof v === 'string' ? v : JSON.stringify(v),
            ])
          );
          stringifiedData.notificationId = notification._id.toString();
          stringifiedData.type = type.toString();
          stringifiedData.title = title;
          stringifiedData.body = message;

          const response = await messaging.sendEachForMulticast({
            tokens: fcmTokens,
            notification: {
              title,
              body: message,
            },
            data: stringifiedData,
            android: {
              priority: 'high',
              notification: {
                channelId: 'finance_alerts_channel',
                sound: 'default',
                priority: 'max',
                visibility: 'public',
                defaultSound: true,
                defaultVibrateTimings: true,
                icon: 'ic_launcher',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                  contentAvailable: true,
                },
              },
            },
          });

          logger.info(
            `[PUSH] 🚀 FCM Multicast sent: ${response.successCount} success, ${response.failureCount} failed`
          );

          // Clean up invalid / unregistered tokens
          if (response.failureCount > 0) {
            response.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error) {
                const errorCode = resp.error.code;
                if (
                  errorCode === 'messaging/registration-token-not-registered' ||
                  errorCode === 'messaging/invalid-registration-token'
                ) {
                  DeviceToken.deleteOne({ fcmToken: fcmTokens[idx] }).exec();
                  logger.warn(`[PUSH] 🗑️ Cleaned up invalid FCM token: ${fcmTokens[idx]}`);
                }
              }
            });
          }
        } catch (fcmErr) {
          logger.warn(`[PUSH] FCM dispatch warning: ${fcmErr.message}`);
        }
      }

      return notification;
    } catch (err) {
      logger.error(`[PUSH ERROR] Failed to send push notification: ${err.message}`);
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
      logger.error(`[PUSH ERROR] Failed to send to role: ${err.message}`);
      return [];
    }
  }

  /**
   * Event Trigger: Instant Collection Alert to Company Admins and Branch Managers
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
    const message = `${collectorName} collected ₹${amount} from ${customerName} (${receiptNo || 'Receipt'})`;

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
        principalAmount: principalAmount ? principalAmount.toString() : '0',
        installmentAmount: installmentAmount ? installmentAmount.toString() : '0',
        event: 'LOAN_DISBURSED',
      },
    });
  }

  /**
   * Event Trigger: Overdue Account Alert
   */
  static async notifyAccountOverdue({
    companyId,
    agentUserId,
    customerName,
    accountNumber,
    overdueDays,
    pendingAmount,
  }) {
    const title = `⚠️ Overdue Alert: ${customerName} (${overdueDays} Days)`;
    const message = `Account ${accountNumber} is ${overdueDays} days overdue. Pending balance: ₹${pendingAmount}`;

    const promises = [];
    if (agentUserId) {
      promises.push(
        this.sendToUser({
          recipientId: agentUserId,
          companyId,
          title,
          message,
          type: NotificationType.OVERDUE,
          data: {
            accountNumber: accountNumber || '',
            customerName: customerName || '',
            overdueDays: overdueDays ? overdueDays.toString() : '0',
            pendingAmount: pendingAmount ? pendingAmount.toString() : '0',
            event: 'ACCOUNT_OVERDUE',
          },
        })
      );
    }

    promises.push(
      this.sendToRole({
        companyId,
        role: 'COMPANY_ADMIN',
        title,
        message,
        type: NotificationType.OVERDUE,
        data: {
          accountNumber: accountNumber || '',
          customerName: customerName || '',
          overdueDays: overdueDays ? overdueDays.toString() : '0',
          pendingAmount: pendingAmount ? pendingAmount.toString() : '0',
          event: 'ACCOUNT_OVERDUE',
        },
      })
    );

    return Promise.all(promises);
  }
}

module.exports = PushNotificationService;
