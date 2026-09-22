const express = require('express');
const ExpenseController = require('../controllers/expense.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/', ExpenseController.createExpense);
router.get('/', ExpenseController.getExpenses);
router.get('/cashbook-summary', ExpenseController.getCashbookSummary);
router.get('/agent-wise', ExpenseController.getAgentWiseExpenses);
router.delete('/:id', ExpenseController.deleteExpense);


module.exports = router;
