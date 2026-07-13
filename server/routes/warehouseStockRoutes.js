const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listWarehouseStock, addWarehouseStock } = require('../controllers/warehouseStockController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin'), listWarehouseStock);
router.post('/add', requireRole('superadmin'), addWarehouseStock);

module.exports = router;
