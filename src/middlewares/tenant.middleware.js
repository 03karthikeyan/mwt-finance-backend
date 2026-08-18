const ApiError = require('../utils/apiError');
const Company = require('../models/Company');
const { ROLES } = require('../config/roles');

/**
 * Middleware ensuring strict Multi-Tenant Isolation
 * Sets req.tenantId based on authenticated user or header (for SuperAdmin)
 */
const requireTenant = async (req, res, next) => {
  try {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    // Super Admin can optionally specify a tenant via header or param
    if (req.user.role === ROLES.SUPER_ADMIN) {
      const headerTenant = req.headers['x-tenant-id'] || req.query.tenantId || req.params.companyId;
      if (headerTenant) {
        req.tenantId = headerTenant;
      }
      return next();
    }

    // Non-SuperAdmin MUST have a valid companyId
    if (!req.user.companyId) {
      return next(ApiError.forbidden('Tenant context is missing for this user'));
    }

    const company = await Company.findById(req.user.companyId);
    if (!company) {
      return next(ApiError.notFound('Associated company tenant not found'));
    }

    if (company.status !== 'ACTIVE') {
      return next(ApiError.forbidden(`Company account is currently ${company.status.toLowerCase()}. Access restricted.`));
    }

    req.tenantId = req.user.companyId;
    req.company = company;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireTenant;
