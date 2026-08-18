const express = require('express');
const BranchController = require('../controllers/branch.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant);

router.get('/', BranchController.getBranches);
router.get('/:id', BranchController.getBranchDetails);
router.post('/', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), BranchController.createBranch);
router.put('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), BranchController.updateBranch);
router.delete('/:id', requireRoles(ROLES.COMPANY_ADMIN), BranchController.deleteBranch);

module.exports = router;
