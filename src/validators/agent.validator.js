const Joi = require('joi');

const createAgentSchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().required(),
    agentCode: Joi.string().alphanum().uppercase().optional(),
    branchId: Joi.string().allow(null, '').optional(),
    assignedRoutes: Joi.array().items(Joi.string()).optional(),
    dailyTarget: Joi.number().min(0).optional(),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    proofType: Joi.string().allow('', null).optional(),
    proofNumber: Joi.string().allow('', null).optional(),
    emergencyContact: Joi.object({
      name: Joi.string().allow('').optional(),
      phone: Joi.string().allow('').optional(),
      relation: Joi.string().allow('').optional(),
    }).optional(),
    address: Joi.object({
      street: Joi.string().allow('').optional(),
      city: Joi.string().allow('').optional(),
      district: Joi.string().allow('').optional(),
      state: Joi.string().allow('').optional(),
      pincode: Joi.string().allow('').optional(),
    }).optional(),
  }),
};

const updateAgentSchema = {
  body: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    branchId: Joi.string().allow(null, '').optional(),
    assignedRoutes: Joi.array().items(Joi.string()).optional(),
    dailyTarget: Joi.number().min(0).optional(),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
    password: Joi.string().min(6).allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    proofType: Joi.string().allow('', null).optional(),
    proofNumber: Joi.string().allow('', null).optional(),
    emergencyContact: Joi.object({
      name: Joi.string().allow('').optional(),
      phone: Joi.string().allow('').optional(),
      relation: Joi.string().allow('').optional(),
    }).optional(),
    address: Joi.object({
      street: Joi.string().allow('').optional(),
      city: Joi.string().allow('').optional(),
      district: Joi.string().allow('').optional(),
      state: Joi.string().allow('').optional(),
      pincode: Joi.string().allow('').optional(),
    }).optional(),
  }),
};

module.exports = {
  createAgentSchema,
  updateAgentSchema,
};
