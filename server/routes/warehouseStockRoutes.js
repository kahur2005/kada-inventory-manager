const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listWarehouseStock, addWarehouseStock, updateWarehouseStock, deleteWarehouseStock } = require('../controllers/warehouseStockController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin'), listWarehouseStock);
router.post('/add', requireRole('superadmin'), addWarehouseStock);
router.patch('/:id', requireRole('superadmin'), updateWarehouseStock);
router.delete('/:id', requireRole('superadmin'), deleteWarehouseStock);

module.exports = router;
