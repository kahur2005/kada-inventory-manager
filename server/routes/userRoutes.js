const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listUsers, createUser, updateRole, deleteUser } = require('../controllers/userController');

router.use(authRequired, requireRole('superadmin'));

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id/role', updateRole);
router.delete('/:id', deleteUser);

module.exports = router;
