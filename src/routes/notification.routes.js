const express = require('express');
const NotificationController = require('../controllers/notification.controller');
const authenticate = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', NotificationController.getMyNotifications);
router.put('/:id/read', NotificationController.markAsRead);
router.delete('/clear-all', NotificationController.clearAll);
router.post('/device-token', NotificationController.registerDeviceToken);
router.delete('/device-token', NotificationController.unregisterDeviceToken);
router.post('/broadcast', NotificationController.broadcastNotification);

module.exports = router;
