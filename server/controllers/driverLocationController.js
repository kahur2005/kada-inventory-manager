const DriverLocation = require('../models/DriverLocation');
const Box = require('../models/Box');

async function upsertLocation(req, res) {
  const { coords } = req.body;
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return res.status(400).json({ message: 'coords: {lat, lng} is required' });
  }
  const doc = await DriverLocation.findOneAndUpdate(
    { driver: req.user.id },
    { coords, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  res.json({ driverLocation: doc });
}

async function listLocations(req, res) {
  let filter = {};
  if (req.user.role === 'warehouse_admin') {
    const boxes = await Box.find({ warehouse: req.user.warehouse, assignedDriver: { $ne: null } }).select('assignedDriver');
    const driverIds = [...new Set(boxes.map((b) => b.assignedDriver.toString()))];
    filter = { driver: { $in: driverIds } };
  }
  const rows = await DriverLocation.find(filter).populate('driver', 'name');
  res.json({ driverLocations: rows });
}

module.exports = { upsertLocation, listLocations };
