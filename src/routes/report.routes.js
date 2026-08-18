const express = require('express');
const ReportController = require('../controllers/report.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant, requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER));

router.get('/daily', ReportController.getDailyReport);
router.get('/weekly', ReportController.getWeeklyReport);
router.get('/monthly', ReportController.getMonthlyReport);
router.get('/agents', ReportController.getAgentPerformanceReport);
router.get('/defaulters', ReportController.getDefaultersReport);
router.get('/export-csv', ReportController.exportPaymentsCsv);

module.exports = router;
