const express = require('express');
const SuperAdminController = require('../controllers/superAdmin.controller');
const authenticate = require('../middlewares/auth.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createCompanySchema, updateCompanySchema } = require('../validators/company.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireRoles(ROLES.SUPER_ADMIN));

router.get('/dashboard', SuperAdminController.getPlatformDashboard);
router.get('/companies', SuperAdminController.getCompanies);
router.post('/companies', validate(createCompanySchema), SuperAdminController.createCompany);
router.get('/companies/:id', SuperAdminController.getCompanyDetails);
router.put('/companies/:id', validate(updateCompanySchema), SuperAdminController.updateCompany);

router.get('/subscription-plans', SuperAdminController.getSubscriptionPlans);
router.post('/subscription-plans', SuperAdminController.createSubscriptionPlan);
router.get('/audit-logs', SuperAdminController.getAuditLogs);

module.exports = router;
