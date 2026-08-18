const express = require('express');
const CompanyController = require('../controllers/company.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/dashboard', CompanyController.getDashboard);
router.get('/profile', CompanyController.getCompanyProfile);
router.put('/profile', requireRoles(ROLES.COMPANY_ADMIN), CompanyController.updateCompanyProfile);
router.get('/settings', CompanyController.getSettings);
router.put('/settings', requireRoles(ROLES.COMPANY_ADMIN), CompanyController.updateSettings);

module.exports = router;
