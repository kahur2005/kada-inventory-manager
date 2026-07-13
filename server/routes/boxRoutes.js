const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { createBox, listBoxes, regenerateQr, assignDriverManual } = require('../controllers/boxController');

router.use(authRequired);
router.post('/', requireRole('warehouse_admin'), createBox);
router.get('/', requireRole('superadmin', 'warehouse_admin', 'driver', 'store_admin'), listBoxes);
router.get('/:id/qr', requireRole('warehouse_admin'), regenerateQr);
router.post('/:id/assign', requireRole('warehouse_admin'), assignDriverManual);

module.exports = router;
