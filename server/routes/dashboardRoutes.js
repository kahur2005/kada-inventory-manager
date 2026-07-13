const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { stats } = require('../controllers/dashboardController');

router.get('/stats', authRequired, requireRole('superadmin'), stats);

module.exports = router;
