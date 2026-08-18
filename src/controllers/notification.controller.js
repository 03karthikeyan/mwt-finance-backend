const Notification = require('../models/Notification');
const PushNotificationService = require('../services/pushNotification.service');
const ApiResponse = require('../utils/apiResponse');

class NotificationController {
  static async getMyNotifications(req, res, next) {
    try {
      const notifications = await Notification.find({ recipientId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50);

      const unreadCount = await Notification.countDocuments({
        recipientId: req.user.id,
        isRead: false,
      });

      return ApiResponse.success(res, 'Notifications retrieved', {
        notifications,
        unreadCount,
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      if (id === 'all') {
        await Notification.updateMany({ recipientId: req.user.id, isRead: false }, { isRead: true });
        return ApiResponse.success(res, 'All notifications marked as read');
      }

      await Notification.findOneAndUpdate({ _id: id, recipientId: req.user.id }, { isRead: true });
      return ApiResponse.success(res, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  static async clearAll(req, res, next) {
    try {
      await Notification.deleteMany({ recipientId: req.user.id });
      return ApiResponse.success(res, 'All notifications cleared successfully');
    } catch (error) {
      next(error);
    }
  }

  static async registerDeviceToken(req, res, next) {
    try {
      const { fcmToken, platform, deviceId, deviceModel, appVersion } = req.body;
      const result = await PushNotificationService.registerDeviceToken({
        userId: req.user.id,
        companyId: req.tenantId || req.user.companyId,
        role: req.user.role,
        fcmToken,
        platform,
        deviceId,
        deviceModel,
        appVersion,
      });

      return ApiResponse.success(res, 'Device push token registered', result);
    } catch (error) {
      next(error);
    }
  }

  static async unregisterDeviceToken(req, res, next) {
    try {
      const { fcmToken } = req.body;
      await PushNotificationService.unregisterDeviceToken({
        userId: req.user.id,
        fcmToken,
      });

      return ApiResponse.success(res, 'Device push token unregistered');
    } catch (error) {
      next(error);
    }
  }

  static async broadcastNotification(req, res, next) {
    try {
      const { targetRole, title, message, data } = req.body;
      const result = await PushNotificationService.sendToRole({
        companyId: req.tenantId,
        role: targetRole || 'AGENT',
        title,
        message,
        data,
      });

      return ApiResponse.success(res, `Broadcast sent to ${result.length} recipients`, {
        sentCount: result.length,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationController;
