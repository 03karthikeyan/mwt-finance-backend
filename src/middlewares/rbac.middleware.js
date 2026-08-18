const ApiError = require('../utils/apiError');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../config/permissions');
const { ROLES } = require('../config/roles');

/**
 * Restricts access to specific role(s)
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next(); // Super admin has global bypass
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' is not authorized to access this resource`));
    }

    next();
  };
};

/**
 * Restricts access based on fine-grained permissions
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (req.user.role === ROLES.SUPER_ADMIN) {
      return next();
    }

    const rolePerms = ROLE_PERMISSIONS[req.user.role] || [];
    const customPerms = req.user.customPermissions || [];
    const allUserPerms = new Set([...rolePerms, ...customPerms]);

    const hasAllRequired = requiredPermissions.every((perm) => allUserPerms.has(perm));

    if (!hasAllRequired) {
      return next(ApiError.forbidden('You do not have the required permissions to perform this operation'));
    }

    next();
  };
};

module.exports = {
  requireRoles,
  requirePermission,
};
