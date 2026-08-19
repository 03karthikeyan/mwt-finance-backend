const JwtUtil = require('../utils/jwtUtil');
const ApiError = require('../utils/apiError');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');
const { ROLES } = require('../config/roles');
const { UserStatus } = require('../constants/enums');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(ApiError.unauthorized('Authentication token is required'));
    }

    const token = authHeader.split(' ')[1];
    const decoded = JwtUtil.verifyAccessToken(token);

    if (!decoded || !decoded.id) {
      return next(ApiError.unauthorized('Invalid or expired authentication token'));
    }

    let user;
    if (decoded.role === ROLES.SUPER_ADMIN) {
      user = await SuperAdmin.findById(decoded.id);
      if (!user || !user.isActive) {
        return next(ApiError.unauthorized('Super Admin account is deactivated or not found'));
      }
      req.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: ROLES.SUPER_ADMIN,
        companyId: null,
      };
    } else {
      user = await User.findById(decoded.id);
      if (!user) {
        return next(ApiError.unauthorized('User account not found'));
      }
      if (user.status !== UserStatus.ACTIVE) {
        return next(ApiError.forbidden(`Your account is ${user.status.toLowerCase()}. Please contact your administrator.`));
      }

      let agentDoc = null;
      if (user.role === ROLES.AGENT) {
        const Agent = require('../models/Agent');
        agentDoc = await Agent.findOne({ userId: user._id, companyId: user.companyId });
      }

      const finalProfileImage = user.profileImage || (agentDoc ? agentDoc.profileImage : '') || '';
      const finalBranchId = user.branchId || (agentDoc ? agentDoc.branchId : null);

      req.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: finalProfileImage,
        companyId: user.companyId ? user.companyId.toString() : null,
        branchId: finalBranchId ? finalBranchId.toString() : null,
        customPermissions: user.customPermissions || [],
      };
    }

    next();
  } catch (error) {
    next(ApiError.unauthorized('Authentication failed'));
  }
};

module.exports = authenticate;
