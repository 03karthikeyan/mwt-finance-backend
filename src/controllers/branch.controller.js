const Branch = require('../models/Branch');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const AuditService = require('../services/audit.service');

class BranchController {
  static async getBranches(req, res, next) {
    try {
      const branches = await Branch.find({ companyId: req.tenantId })
        .populate('managerId', 'name email phone')
        .sort({ createdAt: -1 });

      return ApiResponse.success(res, 'Branches retrieved', branches);
    } catch (error) {
      next(error);
    }
  }

  static async createBranch(req, res, next) {
    try {
      const { branchCode, name, managerId, phone, email, address } = req.body;

      const existing = await Branch.findOne({ companyId: req.tenantId, branchCode: branchCode.toUpperCase() });
      if (existing) {
        throw ApiError.conflict(`Branch code '${branchCode}' already exists in your company.`);
      }

      const branch = new Branch({
        companyId: req.tenantId,
        branchCode: branchCode.toUpperCase(),
        name,
        managerId: managerId || null,
        phone,
        email,
        address,
        status: 'ACTIVE',
      });
      await branch.save();

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'BRANCH_CREATED',
        module: 'BRANCHES',
        recordId: branch._id.toString(),
        req,
      });

      return ApiResponse.created(res, 'Branch created successfully', branch);
    } catch (error) {
      next(error);
    }
  }

  static async updateBranch(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const branch = await Branch.findOneAndUpdate(
        { _id: id, companyId: req.tenantId },
        updates,
        { new: true }
      );

      if (!branch) {
        throw ApiError.notFound('Branch not found');
      }

      return ApiResponse.success(res, 'Branch updated successfully', branch);
    } catch (error) {
      next(error);
    }
  }

  static async getBranchDetails(req, res, next) {
    try {
      const { id } = req.params;
      const branch = await Branch.findOne({ _id: id, companyId: req.tenantId })
        .populate('managerId', 'name email phone');

      if (!branch) {
        throw ApiError.notFound('Branch not found');
      }

      return ApiResponse.success(res, 'Branch details retrieved', branch);
    } catch (error) {
      next(error);
    }
  }

  static async deleteBranch(req, res, next) {
    try {
      const { id } = req.params;
      const branch = await Branch.findOneAndDelete({ _id: id, companyId: req.tenantId });

      if (!branch) {
        throw ApiError.notFound('Branch not found');
      }

      await AuditService.log({
        companyId: req.tenantId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role,
        action: 'BRANCH_DELETED',
        module: 'BRANCHES',
        recordId: id,
        req,
      });

      return ApiResponse.success(res, 'Branch deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = BranchController;
