const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Box = require('../models/Box');
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');
const User = require('../models/User');
const { generateQrDataUrl } = require('../utils/qr');
const { buildDateRangeFilter } = require('../utils/dateRange');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function nextBoxCode() {
  const count = await Box.countDocuments();
  return `BX-${String(count + 1).padStart(4, '0')}`;
}

async function createBox(req, res) {
  const { destinationStore, items } = req.body;
  if (!destinationStore || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'destinationStore and at least one item are required' });
  }

  // Validate destinationStore is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(destinationStore)) {
    return res.status(400).json({ message: 'destinationStore must be a valid id' });
  }

  // Validate that all item ids are valid ObjectIds
  for (const line of items) {
    if (!mongoose.Types.ObjectId.isValid(line.item)) {
      return res.status(400).json({ message: 'item ids must be valid' });
    }
  }

  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: 'You are not linked to a warehouse' });
  }

  const stockRows = await WarehouseStock.find({
    warehouse: warehouseId,
    item: { $in: items.map((line) => line.item) },
  });
  const stockByItem = new Map(stockRows.map((row) => [row.item.toString(), row.qty]));

  const errors = [];
  for (const line of items) {
    const have = stockByItem.get(line.item) || 0;
    if (have < line.qty) {
      errors.push(`Insufficient stock for item ${line.item}: have ${have}, need ${line.qty}`);
    }
  }
  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join('; '), errors });
  }

  for (const line of items) {
    await WarehouseStock.updateOne({ warehouse: warehouseId, item: line.item }, { $inc: { qty: -line.qty } });
  }

  const code = await nextBoxCode();
  const qrToken = uuidv4();
  const box = await Box.create({ code, qrToken, warehouse: warehouseId, destinationStore, items });

  await HandoverLog.create({
    box: box._id,
    actor: req.user.id,
    action: 'BOX_PACKED',
    meta: { code, destinationStore, items },
  });

  const qrDataUrl = await generateQrDataUrl({ type: 'box', id: box._id.toString(), token: qrToken });

  res.status(201).json({ box, qrDataUrl });
}

async function listBoxes(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { status, search, from, to } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (search) filter.code = new RegExp(escapeRegex(search), 'i');

  const { range, error } = buildDateRangeFilter(from, to);
  if (error) {
    return res.status(400).json({ message: error });
  }
  if (range) filter.createdAt = range;

  if (req.user.role === 'warehouse_admin') {
    filter.warehouse = req.user.warehouse;
  } else if (req.user.role === 'driver') {
    filter.assignedDriver = req.user.id;
  } else if (req.user.role === 'store_admin') {
    filter.destinationStore = req.user.store;
  }

  const [boxes, total] = await Promise.all([
    Box.find(filter)
      .populate('warehouse', 'name address')
      .populate('destinationStore', 'name address coords')
      .populate('assignedDriver', 'name')
      .populate('items.item', 'name sku unit')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Box.countDocuments(filter),
  ]);

  res.json({ boxes, total, page, limit });
}

async function regenerateQr(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Box not found' });
  }

  const box = await Box.findById(req.params.id);
  if (!box) return res.status(404).json({ message: 'Box not found' });
  if (req.user.role === 'warehouse_admin' && req.user.warehouse.toString() !== box.warehouse.toString()) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const qrDataUrl = await generateQrDataUrl({ type: 'box', id: box._id.toString(), token: box.qrToken });
  res.json({ qrDataUrl });
}

async function assignDriverManual(req, res) {
  // Validate :id path param is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Box not found' });
  }

  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ message: 'driverId is required' });

  // Validate driverId body param is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ message: 'driverId must be a valid id' });
  }

  const driver = await User.findOne({ _id: driverId, role: 'driver' });
  if (!driver) return res.status(404).json({ message: 'Driver not found' });

  const box = await Box.findOne({ _id: req.params.id, warehouse: req.user.warehouse, status: 'PACKED' });
  if (!box) return res.status(400).json({ message: 'Box not found or not eligible for assignment' });

  box.status = 'ASSIGNED';
  box.assignedDriver = driver._id;
  await box.save();
  await HandoverLog.create({
    box: box._id,
    actor: req.user.id,
    action: 'DRIVER_ASSIGNED',
    meta: { driver: driver._id.toString(), boxIds: [box._id.toString()] },
  });

  res.json({ box });
}

async function pickupBox(req, res) {
  // Validate :id path param is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Box not found' });
  }

  const { coords } = req.body;
  const box = await Box.findById(req.params.id);
  if (!box) return res.status(404).json({ message: 'Box not found' });
  if (!box.assignedDriver || box.assignedDriver.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (box.status !== 'ASSIGNED') {
    return res.status(400).json({ message: `Box is ${box.status}, expected ASSIGNED` });
  }
  box.status = 'IN_TRANSIT';
  await box.save();
  await HandoverLog.create({ box: box._id, actor: req.user.id, action: 'PICKED_UP', coords, meta: {} });
  res.json({ box });
}

module.exports = { createBox, nextBoxCode, listBoxes, regenerateQr, assignDriverManual, pickupBox };
