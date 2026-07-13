const User = require('../models/User');

async function listDrivers(req, res) {
  const drivers = await User.find({ role: 'driver' }).select('name');
  res.json({ drivers: drivers.map((d) => ({ id: d._id.toString(), name: d.name })) });
}

module.exports = { listDrivers };
