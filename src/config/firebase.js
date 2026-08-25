const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let firebaseApp = null;
let firebaseMessaging = null;

const initFirebase = () => {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    firebaseMessaging = getMessaging(firebaseApp);
    global.firebaseMessaging = firebaseMessaging;
    return { app: firebaseApp, messaging: firebaseMessaging };
  }

  try {
    let serviceAccount = null;

    // 1. Check environment variable for raw JSON string
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch (e) {
        logger.warn(`[FIREBASE] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
      }
    }

    // 2. Check candidate local file paths
    if (!serviceAccount) {
      const candidatePaths = [
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
        path.join(__dirname, 'firebase-service-account.json.json'),
        path.join(__dirname, 'firebase-service-account.json'),
        path.join(__dirname, '../../config/firebase-service-account.json'),
        path.join(process.cwd(), 'config', 'firebase-service-account.json'),
        path.join(process.cwd(), 'src', 'config', 'firebase-service-account.json.json'),
        path.join(process.cwd(), 'src', 'config', 'firebase-service-account.json'),
      ].filter(Boolean);

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            const raw = fs.readFileSync(p, 'utf8');
            serviceAccount = JSON.parse(raw);
            logger.info(`[FIREBASE] 🔑 Found service account key at: ${p}`);
            break;
          } catch (readErr) {
            logger.warn(`[FIREBASE] Error reading ${p}: ${readErr.message}`);
          }
        }
      }
    }

    if (serviceAccount && serviceAccount.project_id) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      firebaseMessaging = getMessaging(firebaseApp);
      global.firebaseMessaging = firebaseMessaging;

      logger.info(
        `[FIREBASE] 🔥 Firebase Admin SDK initialized successfully for project: ${serviceAccount.project_id}`
      );
    } else {
      logger.warn(
        '[FIREBASE] ⚠️ No valid Firebase Service Account Key found. Real-time push via FCM will be disabled (In-app notifications will still function).'
      );
    }
  } catch (err) {
    logger.error(`[FIREBASE ERROR] Failed to initialize Firebase Admin: ${err.message}`);
  }

  return { app: firebaseApp, messaging: firebaseMessaging };
};

module.exports = {
  initFirebase,
  getMessaging: () => firebaseMessaging || global.firebaseMessaging,
  isFirebaseConfigured: () => Boolean(firebaseMessaging || global.firebaseMessaging),
};
