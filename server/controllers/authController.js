const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken } = require('../middleware/auth');

function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    warehouse: user.warehouse ? user.warehouse.toString() : null,
    store: user.store ? user.store.toString() : null,
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
  const token = signToken(user);
  res.json({ token, user: toPublicUser(user) });
}

async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({ user: toPublicUser(user) });
}

module.exports = { register, login, me, toPublicUser };
