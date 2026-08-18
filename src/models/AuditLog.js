const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null, // Null for platform-wide Super Admin actions
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: 'System',
    },
    userRole: {
      type: String,
      default: '',
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    module: {
      type: String,
      required: true,
      index: true,
    },
    recordId: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Audit logs should NEVER be updated
  }
);

auditLogSchema.index({ companyId: 1, createdAt: -1 });
auditLogSchema.index({ companyId: 1, module: 1, action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
