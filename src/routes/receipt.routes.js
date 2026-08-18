const express = require('express');
const ReceiptController = require('../controllers/receipt.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/:id', ReceiptController.getReceipt);
router.get('/:id/whatsapp', ReceiptController.getWhatsAppShareLink);

module.exports = router;
