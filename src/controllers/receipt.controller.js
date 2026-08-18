const Receipt = require('../models/Receipt');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

class ReceiptController {
  /**
   * Get Receipt by ID or Receipt Number
   */
  static async getReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

      const query = { companyId: req.tenantId };
      if (isObjectId) {
        query._id = id;
      } else {
        query.receiptNumber = id.toUpperCase();
      }

      const receipt = await Receipt.findOne(query);
      if (!receipt) {
        throw ApiError.notFound('Receipt not found');
      }

      return ApiResponse.success(res, 'Receipt retrieved', receipt);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get WhatsApp Direct Link for sharing receipt
   */
  static async getWhatsAppShareLink(req, res, next) {
    try {
      const { id } = req.params;
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

      const query = { companyId: req.tenantId };
      if (isObjectId) {
        query._id = id;
      } else {
        query.receiptNumber = id.toUpperCase();
      }

      const receipt = await Receipt.findOne(query);
      if (!receipt) {
        throw ApiError.notFound('Receipt not found');
      }

      const encodedMessage = encodeURIComponent(receipt.formattedWhatsAppMessage);
      const cleanPhone = receipt.customerPhone ? receipt.customerPhone.replace(/[^0-9]/g, '') : '';
      const whatsappUrl = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodedMessage}`;

      return ApiResponse.success(res, 'WhatsApp share link generated', {
        whatsappUrl,
        formattedMessage: receipt.formattedWhatsAppMessage,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ReceiptController;
