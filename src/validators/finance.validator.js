const Joi = require('joi');
const { CollectionFrequency } = require('../constants/enums');

const createProductSchema = {
  body: Joi.object({
    name: Joi.string().required().trim(),
    productCode: Joi.string().trim().uppercase().required(),
    description: Joi.string().allow('').optional(),
    frequency: Joi.string().valid(...Object.values(CollectionFrequency)).required(),
    calculationType: Joi.string().valid('FLAT_INTEREST', 'DOCUMENTATION_FEE_DEDUCTION', 'REDUCING_BALANCE', 'FIXED_INSTALLMENT').default('DOCUMENTATION_FEE_DEDUCTION'),
    minAmount: Joi.number().min(0).default(1000),
    maxAmount: Joi.number().min(0).default(500000),
    defaultInstallments: Joi.number().min(1).default(100),
    interestPercentage: Joi.number().min(0).default(0),
    docChargePercentage: Joi.number().min(0).default(5),
    docChargeFixed: Joi.number().min(0).default(0),
    deductChargesUpfront: Joi.boolean().default(true),
    lateFeePerDay: Joi.number().min(0).default(0),
    gracePeriodDays: Joi.number().min(0).default(1),
    excludeSundays: Joi.boolean().optional(),
    excludeHolidays: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').default('ACTIVE'),
  }).unknown(true),
};

const createAccountSchema = {
  body: Joi.object({
    customerId: Joi.string().required(),
    productId: Joi.string().required(),
    agentId: Joi.string().optional(),
    branchId: Joi.string().allow(null).optional(),
    principalAmount: Joi.number().min(100).required(),
    customInstallments: Joi.number().min(1).optional(),
    customInterestPercentage: Joi.number().min(0).optional(),
    customDocChargePercentage: Joi.number().min(0).optional(),
    customDocChargeFixed: Joi.number().min(0).optional(),
    startDate: Joi.date().default(Date.now),
    excludeSundays: Joi.boolean().default(false),
    notes: Joi.string().allow('').optional(),
  }).unknown(true),
};

const recordCollectionSchema = {
  body: Joi.object({
    financeAccountId: Joi.string().required(),
    amount: Joi.number().min(1).required(),
    penaltyCollected: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().valid('CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER').default('CASH'),
    transactionReference: Joi.string().allow('').optional(),
    agentId: Joi.string().optional(),
    customerLocation: Joi.object({
      latitude: Joi.number(),
      longitude: Joi.number(),
    }).optional(),
    notes: Joi.string().allow('').optional(),
    idempotencyKey: Joi.string().allow('').optional(),
  }).unknown(true),
};

module.exports = {
  createProductSchema,
  createAccountSchema,
  recordCollectionSchema,
};
