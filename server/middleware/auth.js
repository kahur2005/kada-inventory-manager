const jwt = require('jsonwebtoken');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const user = await User.findById(decoded.id).lean();
  if (!user) {
    return res.status(401).json({ message: 'User no longer exists' });
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
    warehouse: user.warehouse ? user.warehouse.toString() : null,
    store: user.store ? user.store.toString() : null,
    name: user.name,
    email: user.email,
  };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = { authRequired, requireRole, signToken };
