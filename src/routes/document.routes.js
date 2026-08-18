const express = require('express');
const DocumentController = require('../controllers/document.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const upload = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/upload', upload.single('file'), DocumentController.uploadDocument);
router.get('/', DocumentController.getDocuments);

module.exports = router;
