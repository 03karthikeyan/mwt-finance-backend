require('dotenv').config();

const environment = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:3000,http://localhost:5000,http://localhost:8080')
    .split(',')
    .map(url => url.trim()),
  
  // Database
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/finance_saas_db',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_key_change_in_production_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_key_change_in_production_2026',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  
  // Security
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 10,
  
  // Super Admin Default
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Platform Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@financesaas.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin@2026!',
    phone: process.env.SUPER_ADMIN_PHONE || '+919876543210',
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 mins
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000,
  },
  
  // File Upload
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10,
  },
  
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = environment;
