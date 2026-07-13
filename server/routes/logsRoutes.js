const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listLogs } = require('../controllers/logsController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin', 'store_admin'), listLogs);

module.exports = router;
