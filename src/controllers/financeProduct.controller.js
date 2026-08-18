const FinanceProduct = require('../models/FinanceProduct');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class FinanceProductController {
  static async getProducts(req, res, next) {
    try {
      const { frequency, status } = req.query;
      const query = { companyId: req.tenantId };
      if (frequency) query.frequency = frequency;
      if (status) query.status = status;

      const products = await FinanceProduct.find(query).sort({ createdAt: -1 });
      return ApiResponse.success(res, 'Finance products retrieved', products);
    } catch (error) {
      next(error);
    }
  }

  static async createProduct(req, res, next) {
    try {
      const productData = req.body;

      const existing = await FinanceProduct.findOne({
        companyId: req.tenantId,
        productCode: productData.productCode.toUpperCase(),
      });

      if (existing) {
        throw ApiError.conflict(`Product code '${productData.productCode}' already exists.`);
      }

      const product = new FinanceProduct({
        ...productData,
        companyId: req.tenantId,
        productCode: productData.productCode.toUpperCase(),
      });
      await product.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'PRODUCT_CREATED',
        module: 'FINANCE_PRODUCTS',
        recordId: product._id.toString(),
        req,
      });

      return ApiResponse.created(res, 'Finance product created successfully', product);
    } catch (error) {
      next(error);
    }
  }

  static async updateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const product = await FinanceProduct.findOneAndUpdate(
        { _id: id, companyId: req.tenantId },
        updates,
        { new: true }
      );

      if (!product) {
        throw ApiError.notFound('Product not found');
      }

      return ApiResponse.success(res, 'Finance product updated successfully', product);
    } catch (error) {
      next(error);
    }
  }

  static async deleteProduct(req, res, next) {
    try {
      const { id } = req.params;
      const FinanceAccount = require('../models/FinanceAccount');
      const activeCount = await FinanceAccount.countDocuments({
        productId: id,
        companyId: req.tenantId,
        status: { $in: ['ACTIVE', 'OVERDUE'] },
      });

      if (activeCount > 0) {
        throw ApiError.conflict(`Cannot delete scheme because ${activeCount} active loan account(s) are running under it.`);
      }

      const product = await FinanceProduct.findOneAndDelete({ _id: id, companyId: req.tenantId });
      if (!product) {
        throw ApiError.notFound('Finance product not found');
      }

      return ApiResponse.success(res, 'Finance scheme deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = FinanceProductController;
