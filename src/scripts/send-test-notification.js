const { connectDB } = require('../config/database');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');
const DeviceToken = require('../models/DeviceToken');
const PushNotificationService = require('../services/pushNotification.service');
const { NotificationType } = require('../constants/enums');

async function sendTest() {
  try {
    await connectDB();
    initFirebase();

    const user = await User.findOne({ email: 'admin@royalfinance.com' });
    if (!user) {
      console.log('❌ User admin@royalfinance.com not found.');
      process.exit(1);
    }

    console.log(`👤 Target User: ${user.name} (${user.email})`);

    const tokens = await DeviceToken.find({ userId: user._id });
    console.log(`📲 Registered Device Tokens in DB: ${tokens.length}`);

    tokens.forEach((t) => {
      console.log(`   - Platform: ${t.platform} | Token: ${t.fcmToken.substring(0, 30)}...`);
    });

    console.log('\n🚀 Dispatching live test push notification via Firebase Cloud Messaging...');
    const result = await PushNotificationService.sendToUser({
      recipientId: user._id,
      companyId: user.companyId,
      title: '💰 Live Collection Alert: ₹12,500 Received!',
      message: 'Field Agent Rajesh Kumar collected ₹12,500 from Vijay Sharma (#RCP-9042).',
      type: NotificationType.PAYMENT_SUCCESS,
      data: {
        amount: '12500',
        receiptNo: 'RCP-9042',
        customerName: 'Vijay Sharma',
        accountNumber: 'ACC-10024',
        event: 'PAYMENT_COLLECTED',
      },
    });

    if (result) {
      console.log('✅ Success! Push notification sent to Firebase FCM & in-app database.');
    } else {
      console.log('⚠️ Failed to dispatch.');
    }
  } catch (err) {
    console.error('Error during test push:', err);
  } finally {
    process.exit(0);
  }
}

sendTest();
