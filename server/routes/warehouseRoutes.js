const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } = require('../controllers/warehouseController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin'), listWarehouses);
router.post('/', requireRole('superadmin'), createWarehouse);
router.patch('/:id', requireRole('superadmin'), updateWarehouse);
router.delete('/:id', requireRole('superadmin'), deleteWarehouse);

module.exports = router;
