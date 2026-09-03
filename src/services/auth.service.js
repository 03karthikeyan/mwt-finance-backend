const crypto = require('crypto');
const SuperAdmin = require('../models/SuperAdmin');
const User = require('../models/User');
const Company = require('../models/Company');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const Branch = require('../models/Branch');
const PasswordUtil = require('../utils/passwordUtil');
const JwtUtil = require('../utils/jwtUtil');
const ApiError = require('../utils/apiError');
const { ROLES } = require('../config/roles');
const { UserStatus } = require('../constants/enums');

class AuthService {
  static async login(identifier, password) {
    if (!identifier || !password) {
      throw ApiError.badRequest('Email or mobile number and password are required');
    }

    const cleanInput = identifier.trim();
    const isEmail = cleanInput.includes('@');
    const normalizedEmail = isEmail ? cleanInput.toLowerCase() : null;

    // Normalize phone numbers: support formats like 9811122233, +919811122233, 919811122233
    const cleanPhoneDigits = cleanInput.replace(/\D/g, '');
    const phoneQuery = isEmail
      ? null
      : {
          $or: [
            { phone: cleanInput },
            { phone: `+91${cleanPhoneDigits}` },
            { phone: cleanPhoneDigits.length === 10 ? cleanPhoneDigits : cleanPhoneDigits.slice(-10) },
            { phone: new RegExp(`${cleanPhoneDigits.slice(-10)}$`) },
          ],
        };

    // 1. Check if Super Admin (by email or phone)
    const superAdminQuery = isEmail ? { email: normalizedEmail } : phoneQuery;
    const superAdmin = await SuperAdmin.findOne(superAdminQuery).select('+password');
    if (superAdmin) {
      const isMatch = await PasswordUtil.compare(password, superAdmin.password);
      if (!isMatch) {
        throw ApiError.unauthorized('Invalid mobile number/email or password');
      }
      if (!superAdmin.isActive) {
        throw ApiError.forbidden('Super Admin account is deactivated');
      }

      superAdmin.lastLogin = new Date();
      await superAdmin.save();

      const tokenPayload = {
        id: superAdmin._id.toString(),
        name: superAdmin.name,
        email: superAdmin.email,
        phone: superAdmin.phone,
        role: ROLES.SUPER_ADMIN,
        companyId: null,
      };

      const accessToken = JwtUtil.generateAccessToken(tokenPayload);
      const refreshToken = JwtUtil.generateRefreshToken(tokenPayload);

      return {
        user: {
          id: superAdmin._id,
          name: superAdmin.name,
          email: superAdmin.email,
          phone: superAdmin.phone,
          role: ROLES.SUPER_ADMIN,
          company: null,
        },
        accessToken,
        refreshToken,
      };
    }

    // 2. Check Standard Tenant User (by email or phone)
    const userQuery = isEmail ? { email: normalizedEmail } : phoneQuery;
    const candidateUsers = await User.find(userQuery).select('+password');
    let user = null;

    for (const candidate of candidateUsers) {
      const isMatch = await PasswordUtil.compare(password, candidate.password);
      if (isMatch) {
        user = candidate;
        break;
      }
    }

    // 3. If no matching User was found, check if a Customer record exists with this mobile/email
    if (!user) {
      const Customer = require('../models/Customer');
      const custQuery = isEmail
        ? { email: normalizedEmail }
        : {
            $or: [
              { phone: cleanInput },
              { phone: `+91${cleanPhoneDigits}` },
              { phone: cleanPhoneDigits.length === 10 ? cleanPhoneDigits : cleanPhoneDigits.slice(-10) },
              { phone: new RegExp(`${cleanPhoneDigits.slice(-10)}$`) },
            ],
          };

      const matchedCustomer = await Customer.findOne(custQuery);
      if (matchedCustomer) {
        // If customer already has a linked userId, check its password
        if (matchedCustomer.userId) {
          const linkedUser = await User.findById(matchedCustomer.userId).select('+password');
          if (linkedUser) {
            const isMatch = await PasswordUtil.compare(password, linkedUser.password);
            if (isMatch) {
              user = linkedUser;
            }
          }
        }

        // If not authenticated yet, auto-provision/activate customer User login access
        if (!user) {
          const isInitialValid =
            password === 'Customer@2026!' ||
            password === '123456' ||
            password === cleanPhoneDigits.slice(-6) ||
            password.length >= 6;

          if (isInitialValid) {
            const hashedPassword = await PasswordUtil.hash(password);
            const safeCode = (matchedCustomer.customerCode || 'cust').toLowerCase().replace(/[^a-z0-9]/g, '');
            const safeEmail = matchedCustomer.email && matchedCustomer.email.includes('@')
              ? matchedCustomer.email.toLowerCase()
              : `${safeCode}_${cleanPhoneDigits.slice(-6) || 'cust'}@customer.mwt`;

            const newUser = new User({
              companyId: matchedCustomer.companyId,
              branchId: matchedCustomer.branchId,
              name: matchedCustomer.name,
              email: safeEmail,
              phone: matchedCustomer.phone,
              password: hashedPassword,
              role: ROLES.CUSTOMER,
              status: UserStatus.ACTIVE,
            });
            await newUser.save();
            matchedCustomer.userId = newUser._id;
            await matchedCustomer.save();
            user = newUser;
          }
        }
      }
    }

    if (!user) {
      throw ApiError.unauthorized('Invalid mobile number/email or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw ApiError.forbidden(`Your account is ${user.status.toLowerCase()}. Please contact support.`);
    }

    // Verify Company status
    let company = null;
    if (user.companyId) {
      company = await Company.findById(user.companyId);
      if (!company || company.status !== 'ACTIVE') {
        throw ApiError.forbidden('Your company account is inactive or suspended.');
      }
    }

    user.lastLogin = new Date();
    await user.save();

    let agentDoc = null;
    let customerDoc = null;
    let finalBranchId = user.branchId;

    if (user.role === ROLES.AGENT) {
      const Agent = require('../models/Agent');
      agentDoc = await Agent.findOne({ userId: user._id, companyId: user.companyId });
      if (agentDoc && agentDoc.branchId) {
        finalBranchId = agentDoc.branchId;
      }
    } else if (user.role === ROLES.CUSTOMER) {
      const Customer = require('../models/Customer');
      customerDoc = await Customer.findOne({
        companyId: user.companyId,
        $or: [{ userId: user._id }, { phone: user.phone }],
      })
        .populate({
          path: 'assignedAgentId',
          populate: { path: 'userId', select: 'name phone email profileImage' },
        })
        .populate('branchId', 'name branchCode phone address');

      if (customerDoc && customerDoc.branchId) {
        finalBranchId = customerDoc.branchId._id || customerDoc.branchId;
      }
    }

    const finalProfileImage = user.profileImage || (agentDoc ? agentDoc.profileImage : '') || (customerDoc ? customerDoc.profileImage : '') || '';

    const tokenPayload = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : null,
      branchId: finalBranchId ? finalBranchId.toString() : null,
    };

    const accessToken = JwtUtil.generateAccessToken(tokenPayload);
    const refreshToken = JwtUtil.generateRefreshToken(tokenPayload);

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profileImage: finalProfileImage,
        companyId: user.companyId,
        company: company
          ? {
              id: company._id,
              name: company.name,
              companyCode: company.companyCode,
              currency: company.currency,
              logo: company.logo,
              phone: company.phone,
              email: company.email,
            }
          : null,
        branchId: finalBranchId,
        customer: customerDoc
          ? {
              id: customerDoc._id,
              customerCode: customerDoc.customerCode,
              name: customerDoc.name,
              phone: customerDoc.phone,
              address: customerDoc.address,
              assignedAgent: customerDoc.assignedAgentId
                ? {
                    id: customerDoc.assignedAgentId._id,
                    agentCode: customerDoc.assignedAgentId.agentCode,
                    name: customerDoc.assignedAgentId.userId?.name || 'Assigned Officer',
                    phone: customerDoc.assignedAgentId.userId?.phone || '',
                    profileImage: customerDoc.assignedAgentId.profileImage || customerDoc.assignedAgentId.userId?.profileImage || '',
                    assignedRoutes: customerDoc.assignedAgentId.assignedRoutes || [],
                  }
                : null,
              branch: customerDoc.branchId
                ? {
                    id: customerDoc.branchId._id,
                    name: customerDoc.branchId.name,
                    branchCode: customerDoc.branchId.branchCode,
                    phone: customerDoc.branchId.phone,
                    address: customerDoc.branchId.address,
                  }
                : null,
            }
          : null,
        mustChangePassword: user.mustChangePassword,
      },
      accessToken,
      refreshToken,
    };
  }

  static async refreshAccessToken(refreshToken) {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token is required');
    }

    const decoded = JwtUtil.verifyRefreshToken(refreshToken);
    if (!decoded || !decoded.id) {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const tokenPayload = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
      role: decoded.role,
      companyId: decoded.companyId,
      branchId: decoded.branchId,
    };

    const newAccessToken = JwtUtil.generateAccessToken(tokenPayload);
    const newRefreshToken = JwtUtil.generateRefreshToken(tokenPayload);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  static async changePassword(userId, role, oldPassword, newPassword) {
    if (!oldPassword || !newPassword) {
      throw ApiError.badRequest('Old and new passwords are required');
    }

    if (newPassword.length < 6) {
      throw ApiError.badRequest('New password must be at least 6 characters long');
    }

    let account;
    if (role === ROLES.SUPER_ADMIN) {
      account = await SuperAdmin.findById(userId).select('+password');
    } else {
      account = await User.findById(userId).select('+password');
    }

    if (!account) {
      throw ApiError.notFound('Account not found');
    }

    const isMatch = await PasswordUtil.compare(oldPassword, account.password);
    if (!isMatch) {
      throw ApiError.badRequest('Current password is incorrect');
    }

    account.password = await PasswordUtil.hash(newPassword);
    if (account.mustChangePassword !== undefined) {
      account.mustChangePassword = false;
    }
    await account.save();

    return { message: 'Password changed successfully' };
  }

  /**
   * Request Password Reset OTP
   */
  static async forgotPassword(emailOrPhone) {
    if (!emailOrPhone) {
      throw ApiError.badRequest('Email or phone number is required');
    }

    const cleanInput = emailOrPhone.trim().toLowerCase();
    const isEmail = cleanInput.includes('@');

    let user = await User.findOne(
      isEmail ? { email: cleanInput } : { phone: cleanInput }
    ).select('+resetPasswordOtp +resetPasswordExpires');

    let isSuperAdmin = false;
    if (!user) {
      user = await SuperAdmin.findOne(
        isEmail ? { email: cleanInput } : { phone: cleanInput }
      );
      if (user) isSuperAdmin = true;
    }

    if (!user) {
      throw ApiError.notFound('No account found with this email or phone number');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    user.resetPasswordOtp = hashedOtp;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    await user.save();

    // Log OTP for local development & field agent ease of access
    console.log(`[AUTH] 🔑 Password Reset OTP for ${user.email} (${user.name}): ${otp}`);

    return {
      success: true,
      message: `OTP sent successfully to registered ${isEmail ? 'email' : 'phone'}. Valid for 15 minutes.`,
      emailMasked: user.email.replace(/(.{2})(.*)(?=@)/, (gp1, gp2, gp3) => gp2 + '*'.repeat(gp3.length)),
      phoneMasked: user.phone ? user.phone.replace(/.(?=.{4})/g, '*') : '',
      // For local testing convenience
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    };
  }

  /**
   * Verify Reset OTP and generate temporary resetToken
   */
  static async verifyResetOtp(emailOrPhone, otp) {
    if (!emailOrPhone || !otp) {
      throw ApiError.badRequest('Email/Phone and OTP are required');
    }

    const cleanInput = emailOrPhone.trim().toLowerCase();
    const isEmail = cleanInput.includes('@');
    const hashedOtp = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    let user = await User.findOne({
      ...(isEmail ? { email: cleanInput } : { phone: cleanInput }),
      resetPasswordOtp: hashedOtp,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordOtp +resetPasswordExpires +resetPasswordToken');

    if (!user) {
      throw ApiError.badRequest('Invalid or expired OTP. Please request a new one.');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordOtp = undefined; // Clear OTP once verified
    await user.save();

    return {
      success: true,
      message: 'OTP verified successfully. You can now set your new password.',
      resetToken,
    };
  }

  /**
   * Reset Password with verified resetToken
   */
  static async resetPassword(emailOrPhone, resetToken, newPassword) {
    if (!emailOrPhone || !resetToken || !newPassword) {
      throw ApiError.badRequest('All fields are required');
    }

    if (newPassword.length < 6) {
      throw ApiError.badRequest('New password must be at least 6 characters long');
    }

    const cleanInput = emailOrPhone.trim().toLowerCase();
    const isEmail = cleanInput.includes('@');
    const hashedToken = crypto.createHash('sha256').update(resetToken.trim()).digest('hex');

    let user = await User.findOne({
      ...(isEmail ? { email: cleanInput } : { phone: cleanInput }),
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+password +resetPasswordToken +resetPasswordExpires');

    if (!user) {
      throw ApiError.badRequest('Invalid or expired reset session. Please request OTP again.');
    }

    user.password = await PasswordUtil.hash(newPassword);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordOtp = undefined;
    user.mustChangePassword = false;
    await user.save();

    return {
      success: true,
      message: 'Password has been reset successfully! You can now log in.',
    };
  }

  static async setMpin(userId, mpin) {
    if (!mpin || mpin.length !== 4) {
      throw ApiError.badRequest('MPIN must be a 4-digit numeric code');
    }
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User account not found');
    }

    user.mpin = await PasswordUtil.hash(mpin);
    await user.save();

    return { success: true, message: '4-Digit MPIN updated successfully' };
  }

  static async loginWithMpin(phone, mpin) {
    if (!phone || !mpin) {
      throw ApiError.badRequest('Mobile number and 4-digit MPIN are required');
    }

    const cleanPhoneDigits = phone.trim().replace(/\D/g, '');
    const user = await User.findOne({
      $or: [
        { phone: phone.trim() },
        { phone: `+91${cleanPhoneDigits}` },
        { phone: cleanPhoneDigits.length === 10 ? cleanPhoneDigits : cleanPhoneDigits.slice(-10) },
      ],
    }).select('+mpin +password');

    if (!user || !user.mpin) {
      throw ApiError.unauthorized('Invalid phone number or MPIN not configured');
    }

    const isMatch = await PasswordUtil.compare(mpin, user.mpin);
    if (!isMatch) {
      throw ApiError.unauthorized('Incorrect 4-digit MPIN');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw ApiError.forbidden(`Your account is ${user.status.toLowerCase()}`);
    }

    user.lastLogin = new Date();
    await user.save();

    const company = await Company.findById(user.companyId);
    const tokenPayload = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      companyId: user.companyId ? user.companyId.toString() : null,
      branchId: user.branchId ? user.branchId.toString() : null,
    };

    const accessToken = JwtUtil.generateAccessToken(tokenPayload);
    const refreshToken = JwtUtil.generateRefreshToken(tokenPayload);

    return {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        companyId: user.companyId,
        branchId: user.branchId,
        profileImage: user.profileImage || '',
      },
      tokens: { accessToken, refreshToken },
      companyName: company ? company.name : '',
    };
  }
}

module.exports = AuthService;
