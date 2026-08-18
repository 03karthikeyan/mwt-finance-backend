const Joi = require('joi');

const createCustomerSchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    phone: Joi.string().required().trim(),
    alternatePhone: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    branchId: Joi.string().optional(),
    assignedAgentId: Joi.string().optional(),
    address: Joi.object({
      street: Joi.string().allow('').optional(),
      city: Joi.string().allow('').optional(),
      state: Joi.string().allow('').optional(),
      pincode: Joi.string().allow('').optional(),
      routeArea: Joi.string().allow('').optional(),
      latitude: Joi.number().optional(),
      longitude: Joi.number().optional(),
    }).optional(),
    guarantor: Joi.object({
      name: Joi.string().allow('').optional(),
      phone: Joi.string().allow('').optional(),
      relation: Joi.string().allow('').optional(),
      address: Joi.string().allow('').optional(),
    }).optional(),
    identityProof: Joi.object({
      idType: Joi.string().allow('').optional(),
      idNumber: Joi.string().allow('').optional(),
    }).optional(),
    creditLimit: Joi.number().min(0).optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

const updateCustomerSchema = {
  body: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    alternatePhone: Joi.string().allow('').optional(),
    email: Joi.string().email().allow('').optional(),
    assignedAgentId: Joi.string().allow(null).optional(),
    branchId: Joi.string().allow(null).optional(),
    address: Joi.object().optional(),
    guarantor: Joi.object().optional(),
    identityProof: Joi.object().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BLOCKED').optional(),
    creditLimit: Joi.number().min(0).optional(),
    notes: Joi.string().allow('').optional(),
  }),
};

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
};
