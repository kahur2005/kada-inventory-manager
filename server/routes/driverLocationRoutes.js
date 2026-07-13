const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { upsertLocation, listLocations } = require('../controllers/driverLocationController');

router.post('/driver-location', authRequired, requireRole('driver'), upsertLocation);
router.get('/driver-locations', authRequired, requireRole('superadmin', 'warehouse_admin'), listLocations);

module.exports = router;
