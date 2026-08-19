const express = require('express');
const AgentController = require('../controllers/agent.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const { requireRoles } = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { createAgentSchema, updateAgentSchema } = require('../validators/agent.validator');
const { ROLES } = require('../config/roles');

const router = express.Router();

router.use(authenticate, requireTenant);

// Agent specific dashboard & assigned customers list
router.get('/me', AgentController.getMyAgentProfile);
router.get('/my-dashboard', AgentController.getAgentDashboard);
router.get('/my-customers', AgentController.getMyAssignedCustomers);

// Company Admin agent management
router.get('/', AgentController.getAgents);
router.post('/', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), validate(createAgentSchema), AgentController.createAgent);
router.put('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), AgentController.updateAgent);
router.delete('/:id', requireRoles(ROLES.COMPANY_ADMIN, ROLES.MANAGER), AgentController.deleteAgent);

module.exports = router;
