const express = require('express');
const PaymentController = require('../controllers/payment.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', PaymentController.getPayments);
router.get('/:id', PaymentController.getPaymentDetails);

module.exports = router;
