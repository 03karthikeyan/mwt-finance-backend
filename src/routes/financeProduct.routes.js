const express = require('express');
const FinanceProductController = require('../controllers/financeProduct.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createProductSchema } = require('../validators/finance.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', FinanceProductController.getProducts);
router.post('/', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), validate(createProductSchema), FinanceProductController.createProduct);
router.put('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), FinanceProductController.updateProduct);
router.delete('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), FinanceProductController.deleteProduct);

module.exports = router;
