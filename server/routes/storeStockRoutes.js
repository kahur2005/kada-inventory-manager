const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listStoreStock, adjustStoreStock, setThreshold } = require('../controllers/storeStockController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin', 'store_admin'), listStoreStock);
router.patch('/:id/adjust', requireRole('store_admin'), adjustStoreStock);
router.patch('/:id/threshold', requireRole('superadmin', 'warehouse_admin'), setThreshold);

module.exports = router;
