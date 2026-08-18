const Document = require('../models/Document');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class DocumentController {
  static async uploadDocument(req, res, next) {
    try {
      if (!req.file) {
        throw ApiError.badRequest('File is required for upload');
      }

      const { customerId, title, documentType } = req.body;
      const fileUrl = `/uploads/${req.file.filename}`;

      const doc = new Document({
        companyId: req.tenantId,
        customerId: customerId || null,
        uploadedById: req.user.id,
        title: title || req.file.originalname,
        documentType: documentType || 'OTHER',
        fileUrl,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      });
      await doc.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'DOCUMENT_UPLOADED',
        module: 'DOCUMENTS',
        recordId: doc._id.toString(),
        req,
      });

      return ApiResponse.created(res, 'Document uploaded successfully', doc);
    } catch (error) {
      next(error);
    }
  }

  static async getDocuments(req, res, next) {
    try {
      const { customerId } = req.query;
      const query = { companyId: req.tenantId };
      if (customerId) query.customerId = customerId;

      const docs = await Document.find(query)
        .populate('uploadedById', 'name email')
        .sort({ createdAt: -1 });

      return ApiResponse.success(res, 'Documents retrieved', docs);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = DocumentController;
