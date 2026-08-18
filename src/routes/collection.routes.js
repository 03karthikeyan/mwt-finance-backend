const express = require('express');
const CollectionController = require('../controllers/collection.controller');
const authenticate = require('../middlewares/auth.middleware');
const requireTenant = require('../middlewares/tenant.middleware');
const validate = require('../middlewares/validate.middleware');
const { recordCollectionSchema } = require('../validators/finance.validator');

const router = express.Router();

router.use(authenticate, requireTenant);

router.post('/record', validate(recordCollectionSchema), CollectionController.recordCollection);
router.get('/today-sheet', CollectionController.getTodayCollectionSheet);
router.get('/today-collections', CollectionController.getTodayCollections);
router.post('/bulk', CollectionController.recordBulkCollection);
router.post('/settle-handover', CollectionController.settleCollectionHandover);

module.exports = router;
