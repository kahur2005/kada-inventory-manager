const mongoose = require('mongoose');
const User = require('../models/User');
const Box = require('../models/Box');
const HandoverLog = require('../models/HandoverLog');
const StoreStock = require('../models/StoreStock');

async function scanDriverAssign(req, res) {
  const { token, boxIds, expectedArrival } = req.body;
  if (!token || !Array.isArray(boxIds) || boxIds.length === 0) {
    return res.status(400).json({ message: 'token and at least one boxId are required' });
  }

  let expectedArrivalDate;
  if (expectedArrival) {
    expectedArrivalDate = new Date(expectedArrival);
    if (Number.isNaN(expectedArrivalDate.getTime())) {
      return res.status(400).json({ message: 'expectedArrival is not a valid date' });
    }
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

  const boxes = await Box.find({ _id: { $in: boxIds }, warehouse: req.user.warehouse, status: 'PACKED' })
    .populate('destinationStore', 'name address');
  if (boxes.length !== boxIds.length) {
    return res.status(400).json({ message: 'One or more boxes are not eligible for assignment (wrong warehouse or not PACKED)' });
  }

  const boxUpdate = { status: 'ASSIGNED', assignedDriver: driver._id };
  if (expectedArrivalDate) boxUpdate.expectedArrival = expectedArrivalDate;
  await Box.updateMany({ _id: { $in: boxIds } }, boxUpdate);
  await HandoverLog.create(boxes.map((box) => ({
    box: box._id,
    actor: req.user.id,
    action: 'DRIVER_ASSIGNED',
    meta: { driver: driver._id.toString(), boxIds },
  })));

  res.json({
    message: `${boxes.length} box(es) assigned to ${driver.name}`,
    driver: { id: driver._id.toString(), name: driver.name },
    boxes: boxes.map((b) => ({
      id: b._id.toString(),
      code: b.code,
      destinationStore: b.destinationStore
        ? { name: b.destinationStore.name, address: b.destinationStore.address ?? null }
        : null,
    })),
  });
}

async function scanBox(req, res) {
  const { token, code, coords } = req.body;
  if (!token && !code) {
    return res.status(400).json({ message: 'token or code is required' });
  }
  if (code && typeof code !== 'string') {
    return res.status(400).json({ message: 'code must be a string' });
  }

  const box = token
    ? await Box.findOne({ qrToken: token }).populate('items.item', 'name sku unit')
    : await Box.findOne({ code: code.toUpperCase() }).populate('items.item', 'name sku unit');

  if (!box) {
    return res.status(404).json({ message: 'Box not found' });
  }
  if (!['ASSIGNED', 'IN_TRANSIT'].includes(box.status)) {
    return res.status(400).json({ message: `Box is already ${box.status}` });
  }
  if (box.destinationStore.toString() !== req.user.store) {
    return res.status(403).json({ message: 'This box is not destined for your store' });
  }

  const session = await mongoose.startSession();
  let deliveredBox;
  try {
    await session.withTransaction(async () => {
      deliveredBox = await Box.findOneAndUpdate(
        {
          _id: box._id,
          destinationStore: req.user.store,
          status: { $in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
        { $set: { status: 'DELIVERED' } },
        { new: true, session },
      ).populate('items.item', 'name sku unit');

      if (!deliveredBox) {
        throw Object.assign(new Error('Box is already delivered or no longer eligible'), { status: 400 });
      }

      for (const line of deliveredBox.items) {
        if (!line.item) {
          throw Object.assign(new Error('One or more items on this box no longer exist'), { status: 409 });
        }
        await StoreStock.findOneAndUpdate(
          { store: req.user.store, item: line.item._id },
          { $inc: { qty: line.qty }, $setOnInsert: { threshold: 0 } },
          { upsert: true, session },
        );
      }

      const items = deliveredBox.items.map((line) => ({ name: line.item.name, qty: line.qty }));
      await HandoverLog.create([{
        box: deliveredBox._id,
        actor: req.user.id,
        action: 'DELIVERED',
        coords,
        meta: { items },
      }], { session });
    });
  } catch (error) {
    return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({
      message: error.message || 'Unable to deliver box',
    });
  } finally {
    await session.endSession();
  }

  const items = deliveredBox.items.map((line) => ({ name: line.item.name, qty: line.qty }));

  res.json({ message: 'Box delivered', items, box: deliveredBox });
}

module.exports = { scanDriverAssign, scanBox };
