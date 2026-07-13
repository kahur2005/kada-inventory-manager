const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const Store = require('../models/Store');
const { toPublicUser } = require('./authController');

const ALLOWED_ROLES = ['superadmin', 'warehouse_admin', 'store_admin', 'driver', 'unassigned'];

async function buildScopePatch(role, warehouse, store) {
  if (role === 'warehouse_admin') {
    if (!warehouse) return { error: 'warehouse is required for role warehouse_admin' };
    const wh = await Warehouse.findById(warehouse);
    if (!wh) return { error: 'warehouse not found' };
    return { warehouse: wh._id, store: null };
  }
  if (role === 'store_admin') {
    if (!store) return { error: 'store is required for role store_admin' };
    const st = await Store.findById(store);
    if (!st) return { error: 'store not found' };
    return { warehouse: null, store: st._id };
  }
  return { warehouse: null, store: null };
}

async function listUsers(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const search = (req.query.search || '').trim();

  const filter = search
    ? { $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ users: users.map(toPublicUser), total, page, limit });
}

async function createUser(req, res) {
  const { name, email, password, role = 'unassigned', warehouse, store } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of ${ALLOWED_ROLES.join(', ')}` });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const patch = await buildScopePatch(role, warehouse, store);
  if (patch.error) return res.status(400).json({ message: patch.error });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    warehouse: patch.warehouse,
    store: patch.store,
    driverQrToken: role === 'driver' ? uuidv4() : null,
  });
  res.status(201).json({ user: toPublicUser(user) });
}

async function updateRole(req, res) {
  const { role, warehouse, store } = req.body;
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of ${ALLOWED_ROLES.join(', ')}` });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const patch = await buildScopePatch(role, warehouse, store);
  if (patch.error) return res.status(400).json({ message: patch.error });

  user.role = role;
  user.warehouse = patch.warehouse;
  user.store = patch.store;
  if (role === 'driver' && !user.driverQrToken) {
    user.driverQrToken = uuidv4();
  }
  await user.save();
  res.json({ user: toPublicUser(user) });
}

async function deleteUser(req, res) {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
}

module.exports = { listUsers, createUser, updateRole, deleteUser };
