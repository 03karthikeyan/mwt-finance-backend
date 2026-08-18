const Joi = require('joi');

const createAgentSchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().required(),
    agentCode: Joi.string().alphanum().uppercase().optional(),
    branchId: Joi.string().allow(null).optional(),
    assignedRoutes: Joi.array().items(Joi.string()).optional(),
    dailyTarget: Joi.number().min(0).optional(),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
  }),
};

const updateAgentSchema = {
  body: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    branchId: Joi.string().allow(null).optional(),
    assignedRoutes: Joi.array().items(Joi.string()).optional(),
    dailyTarget: Joi.number().min(0).optional(),
    commissionPercentage: Joi.number().min(0).max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
  }),
};

module.exports = {
  createAgentSchema,
  updateAgentSchema,
};
