const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listItems, createItem, updateItem, deleteItem } = require('../controllers/itemController');

router.use(authRequired);
router.get('/', listItems);
router.post('/', requireRole('superadmin'), createItem);
router.patch('/:id', requireRole('superadmin'), updateItem);
router.delete('/:id', requireRole('superadmin'), deleteItem);

module.exports = router;
