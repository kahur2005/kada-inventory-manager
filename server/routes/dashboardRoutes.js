const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { stats } = require('../controllers/dashboardController');
const {
  driverPerformance,
  stockAvailability,
} = require('../controllers/warehouseDashboardController');

router.get('/stats', authRequired, requireRole('superadmin'), stats);
router.get('/warehouse/driver-performance', authRequired, requireRole('warehouse_admin'), driverPerformance);
router.get('/warehouse/stock-availability', authRequired, requireRole('warehouse_admin'), stockAvailability);

module.exports = router;
