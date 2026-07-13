const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { createBox } = require('../controllers/boxController');

router.use(authRequired);
router.post('/', requireRole('warehouse_admin'), createBox);

module.exports = router;
