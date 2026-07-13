const mongoose = require('mongoose');
const User = require('../models/User');
const Box = require('../models/Box');
const HandoverLog = require('../models/HandoverLog');

async function scanDriverAssign(req, res) {
  const { token, boxIds } = req.body;
  if (!token || !Array.isArray(boxIds) || boxIds.length === 0) {
    return res.status(400).json({ message: 'token and at least one boxId are required' });
  }

  // Validate that all boxIds are well-formed ObjectIds
  for (const boxId of boxIds) {
    if (!mongoose.Types.ObjectId.isValid(boxId)) {
      return res.status(400).json({ message: 'One or more boxIds are malformed' });
    }
  }

  const driver = await User.findOne({ role: 'driver', driverQrToken: token });
  if (!driver) {
    return res.status(400).json({ message: 'Driver QR not recognized' });
  }

  const boxes = await Box.find({ _id: { $in: boxIds }, warehouse: req.user.warehouse, status: 'PACKED' });
  if (boxes.length !== boxIds.length) {
    return res.status(400).json({ message: 'One or more boxes are not eligible for assignment (wrong warehouse or not PACKED)' });
  }

  await Box.updateMany({ _id: { $in: boxIds } }, { status: 'ASSIGNED', assignedDriver: driver._id });
  await HandoverLog.create({
    actor: req.user.id,
    action: 'DRIVER_ASSIGNED',
    meta: { driver: driver._id.toString(), boxIds },
  });

  res.json({ message: `${boxes.length} box(es) assigned to ${driver.name}`, driver: { id: driver._id.toString(), name: driver.name } });
}

module.exports = { scanDriverAssign };
