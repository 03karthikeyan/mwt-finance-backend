const express = require('express');
const { getAgentDaySummary, submitDayClosing, verifyDayClosing } = require('../controllers/dayClosing.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/summary', getAgentDaySummary);
router.post('/submit', submitDayClosing);
router.patch('/:id/verify', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), verifyDayClosing);

module.exports = router;
