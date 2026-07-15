const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const { signToken } = require('../middleware/auth');

const SCOPE_FIELDS = 'name address coords';

// Resolves the warehouse a store_admin's store is assigned to (a warehouse lists
// its served stores in `stores`), and attaches it to the public user payload.
async function attachAssignedWarehouse(userDoc, publicUser) {
  if (userDoc.role !== 'store_admin' || !userDoc.store) return publicUser;
  const storeId = userDoc.store._id || userDoc.store;
  const wh = await Warehouse.findOne({ stores: storeId }).select(SCOPE_FIELDS).lean();
  publicUser.assignedWarehouse = wh
    ? { id: wh._id.toString(), name: wh.name, address: wh.address ?? null, coords: wh.coords ?? null }
    : null;
  return publicUser;
}

function toPublicScope(value) {
  if (!value) return null;
  if (value.name !== undefined) {
    return { id: value._id.toString(), name: value.name, address: value.address ?? null, coords: value.coords ?? null };
  }
  return value.toString();
}

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    warehouse: toPublicScope(user.warehouse),
    store: toPublicScope(user.store),
    driverQrToken: user.role === 'driver' ? user.driverQrToken : null,
  };
}

async function register(req, res) {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email, and password are required' });
  }
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({ message: 'Email already registered' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash, role: 'unassigned' });
  const token = signToken(user);
  res.status(201).json({ token, user: toPublicUser(user) });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  await user.populate([
    { path: 'warehouse', select: SCOPE_FIELDS },
    { path: 'store', select: SCOPE_FIELDS },
  ]);
  const token = signToken(user);
  res.json({ token, user: await attachAssignedWarehouse(user, toPublicUser(user)) });
}

async function me(req, res) {
  const user = await User.findById(req.user.id)
    .populate('warehouse', SCOPE_FIELDS)
    .populate('store', SCOPE_FIELDS);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({ user: await attachAssignedWarehouse(user, toPublicUser(user)) });
}

module.exports = { register, login, me, toPublicUser };
