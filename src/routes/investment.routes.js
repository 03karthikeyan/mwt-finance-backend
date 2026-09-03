const express = require('express');
const { getInvestments, createInvestment } = require('../controllers/investment.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), getInvestments);
router.post('/', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), createInvestment);

module.exports = router;
