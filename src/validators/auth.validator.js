const Joi = require('joi');

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().min(4).required().messages({
      'any.required': 'Password is required',
    }),
  }),
};

const changePasswordSchema = {
  body: Joi.object({
    oldPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'New password must be at least 6 characters long',
    }),
  }),
};

const refreshTokenSchema = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

const forgotPasswordSchema = {
  body: Joi.object({
    emailOrPhone: Joi.string().required().messages({
      'any.required': 'Email or phone number is required',
    }),
  }),
};

const verifyResetOtpSchema = {
  body: Joi.object({
    emailOrPhone: Joi.string().required(),
    otp: Joi.string().length(6).required().messages({
      'string.length': 'OTP must be exactly 6 digits',
      'any.required': 'OTP is required',
    }),
  }),
};

const resetPasswordSchema = {
  body: Joi.object({
    emailOrPhone: Joi.string().required(),
    resetToken: Joi.string().required().messages({
      'any.required': 'Reset authorization token is required',
    }),
    newPassword: Joi.string().min(6).required().messages({
      'string.min': 'New password must be at least 6 characters long',
      'any.required': 'New password is required',
    }),
  }),
};

module.exports = {
  loginSchema,
  changePasswordSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
};
