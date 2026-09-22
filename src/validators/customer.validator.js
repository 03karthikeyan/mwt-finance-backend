const Joi = require('joi');

const createCustomerSchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    phone: Joi.string().required().trim(),
    alternatePhone: Joi.string().allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    branchId: Joi.string().allow('', null).optional(),
    assignedAgentId: Joi.string().allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    address: Joi.object({
      street: Joi.string().allow('', null).optional(),
      city: Joi.string().allow('', null).optional(),
      state: Joi.string().allow('', null).optional(),
      pincode: Joi.string().allow('', null).optional(),
      routeArea: Joi.string().allow('', null).optional(),
      latitude: Joi.number().allow(null).optional(),
      longitude: Joi.number().allow(null).optional(),
    }).optional(),
    guarantor: Joi.object({
      name: Joi.string().allow('', null).optional(),
      phone: Joi.string().allow('', null).optional(),
      relation: Joi.string().allow('', null).optional(),
      address: Joi.string().allow('', null).optional(),
    }).optional(),
    identityProof: Joi.object({
      idType: Joi.string().allow('', null).optional(),
      idNumber: Joi.string().allow('', null).optional(),
    }).optional(),
    creditLimit: Joi.number().min(0).allow('', null).optional(),
    notes: Joi.string().allow('', null).optional(),
    createLoginAccount: Joi.boolean().optional(),
    loginPassword: Joi.string().allow('', null).optional(),
    loanProductId: Joi.string().allow('', null).optional(),
    loanPrincipalAmount: Joi.number().min(0).allow('', null).optional(),
    loanStartDate: Joi.alternatives().try(Joi.date(), Joi.string().allow('', null)).optional(),
  }).unknown(true),
};

const updateCustomerSchema = {
  body: Joi.object({
    name: Joi.string().optional(),
    phone: Joi.string().optional(),
    alternatePhone: Joi.string().allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    assignedAgentId: Joi.string().allow('', null).optional(),
    branchId: Joi.string().allow('', null).optional(),
    profileImage: Joi.string().allow('', null).optional(),
    address: Joi.object().optional(),
    guarantor: Joi.object().optional(),
    identityProof: Joi.object().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BLOCKED').optional(),
    creditLimit: Joi.number().min(0).allow('', null).optional(),
    notes: Joi.string().allow('', null).optional(),
  }).unknown(true),
};

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
};
