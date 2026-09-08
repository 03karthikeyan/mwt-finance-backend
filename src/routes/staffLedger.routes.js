const express = require('express');
const StaffLedgerController = require('../controllers/staffLedger.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/', StaffLedgerController.createTransaction);
router.get('/', StaffLedgerController.getLedger);
router.get('/summary/:staffId', StaffLedgerController.getStaffSummary);

module.exports = router;
