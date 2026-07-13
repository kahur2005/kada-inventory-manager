const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listDrivers } = require('../controllers/driverController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin'), listDrivers);

module.exports = router;
