const Joi = require('joi');

const createCompanySchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    companyCode: Joi.string().alphanum().min(2).max(10).uppercase().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().required(),
    adminName: Joi.string().required(),
    adminPassword: Joi.string().min(6).required(),
    currencyCode: Joi.string().default('INR'),
    currencySymbol: Joi.string().default('₹'),
    address: Joi.object({
      street: Joi.string().allow(''),
      city: Joi.string().allow(''),
      state: Joi.string().allow(''),
      pincode: Joi.string().allow(''),
      country: Joi.string().default('India'),
    }).optional(),
    subscriptionPlanId: Joi.string().optional(),
  }),
};

const updateCompanySchema = {
  body: Joi.object({
    name: Joi.string().optional().trim(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
    address: Joi.object({
      street: Joi.string().allow(''),
      city: Joi.string().allow(''),
      state: Joi.string().allow(''),
      pincode: Joi.string().allow(''),
      country: Joi.string().allow(''),
    }).optional(),
  }),
};

module.exports = {
  createCompanySchema,
  updateCompanySchema,
};
