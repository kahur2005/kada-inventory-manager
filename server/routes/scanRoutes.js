const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { scanDriverAssign } = require('../controllers/scanController');

router.post('/driver', authRequired, requireRole('warehouse_admin'), scanDriverAssign);

module.exports = router;
