const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { scanDriverAssign, scanBox } = require('../controllers/scanController');

router.post('/driver', authRequired, requireRole('warehouse_admin'), scanDriverAssign);
router.post('/box', authRequired, requireRole('store_admin'), scanBox);

module.exports = router;
