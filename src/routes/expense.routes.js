const express = require('express');
const { getExpenses, createExpense, updateExpenseStatus } = require('../controllers/expense.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', getExpenses);
router.post('/', createExpense);
router.patch('/:id/status', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN', 'BRANCH_MANAGER', 'MANAGER'), updateExpenseStatus);

module.exports = router;
