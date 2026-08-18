const express = require('express');
const FinanceAccountController = require('../controllers/financeAccount.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createAccountSchema } = require('../validators/finance.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', FinanceAccountController.getAccounts);
router.post('/preview-disbursement', FinanceAccountController.previewDisbursement);
router.post('/disburse', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER, ROLES.STAFF, ROLES.AGENT), validate(createAccountSchema), FinanceAccountController.disburseLoan);
router.get('/:id', FinanceAccountController.getAccountDetails);

module.exports = router;
