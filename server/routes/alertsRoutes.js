const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listAlerts } = require('../controllers/alertsController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin'), listAlerts);

module.exports = router;
