const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listStores, createStore, updateStore, deleteStore } = require('../controllers/storeController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'store_admin'), listStores);
router.post('/', requireRole('superadmin'), createStore);
router.patch('/:id', requireRole('superadmin'), updateStore);
router.delete('/:id', requireRole('superadmin'), deleteStore);

module.exports = router;
