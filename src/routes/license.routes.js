const express = require('express');
const { getCompanyLicense, renewServiceMaintenance } = require('../controllers/license.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');

const router = express.Router();

router.use(authenticate);

router.get('/my-license', requireTenant, getCompanyLicense);
router.post('/renew', requireRoles('SUPER_ADMIN', 'COMPANY_ADMIN'), renewServiceMaintenance);

module.exports = router;
