const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

class AuditService {
  static async log({
    companyId = null,
    userId,
    userName = 'System',
    userRole = '',
    action,
    module,
    recordId = '',
    req = null,
    metadata = {},
  }) {
    try {
      let ipAddress = '';
      let userAgent = '';

      if (req) {
        ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        userAgent = req.headers['user-agent'] || '';
      }

      await AuditLog.create({
        companyId,
        userId,
        userName,
        userRole,
        action,
        module,
        recordId,
        ipAddress,
        userAgent,
        metadata,
      });
    } catch (err) {
      // Audit failure should not crash the transaction, but log warning
      logger.warn(`Failed to create audit log: ${err.message}`);
    }
  }
}

module.exports = AuditService;
