const express = require('express');
const CustomerController = require('../controllers/customer.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const validate = require('../middlewares/validate.middleware');
const { createCustomerSchema, updateCustomerSchema } = require('../validators/customer.validator');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/portal-dashboard', CustomerController.getCustomerPortalDashboard);
router.get('/portal-loans/:id/schedule', CustomerController.getCustomerLoanSchedule);
router.get('/portal-payments', CustomerController.getCustomerPayments);
router.post('/:id/login-access', CustomerController.setCustomerLoginAccess);

router.get('/', CustomerController.getCustomers);
router.post('/', validate(createCustomerSchema), CustomerController.createCustomer);
router.get('/:id', CustomerController.getCustomerDetails);
router.put('/:id', validate(updateCustomerSchema), CustomerController.updateCustomer);
router.patch('/:id/kyc-status', CustomerController.updateKycStatus);
router.delete('/:id', CustomerController.deleteCustomer);

module.exports = router;
