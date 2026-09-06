const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Box = require('../models/Box');
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');
const User = require('../models/User');
const Store = require('../models/Store');
const Item = require('../models/Item');
const { generateQrDataUrl } = require('../utils/qr');
const { buildDateRangeFilter } = require('../utils/dateRange');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function nextBoxCode(session) {
  const count = await Box.countDocuments({}, session ? { session } : undefined);
  return `BX-${String(count + 1).padStart(4, '0')}`;
}

function httpError(message, status = 400, errors) {
  const error = new Error(message);
  error.status = status;
  if (errors) error.errors = errors;
  return error;
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

  const normalizedByItem = new Map();
  for (const line of items) {
    if (!line || !mongoose.Types.ObjectId.isValid(line.item)) {
      return res.status(400).json({ message: 'item ids must be valid' });
    }
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      return res.status(400).json({ message: 'item quantities must be positive integers' });
    }
    const itemId = line.item.toString();
    normalizedByItem.set(itemId, (normalizedByItem.get(itemId) || 0) + line.qty);
  }

  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: 'You are not linked to a warehouse' });
  }

  const normalizedItems = [...normalizedByItem.entries()].map(([item, qty]) => ({ item, qty }));
  let box;
  let code;
  let qrToken;

  for (let attempt = 0; attempt < 3 && !box; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const [store, itemCount] = await Promise.all([
          Store.exists({ _id: destinationStore }).session(session),
          Item.countDocuments({ _id: { $in: normalizedItems.map((line) => line.item) } }).session(session),
        ]);
        if (!store) throw httpError('Destination store not found', 404);
        if (itemCount !== normalizedItems.length) throw httpError('One or more items were not found', 400);

        const stockRows = await WarehouseStock.find({
          warehouse: warehouseId,
          item: { $in: normalizedItems.map((line) => line.item) },
        }).session(session);
        const stockByItem = new Map(stockRows.map((row) => [row.item.toString(), row.qty]));
        const errors = normalizedItems
          .filter((line) => (stockByItem.get(line.item.toString()) || 0) < line.qty)
          .map((line) => `Insufficient stock for item ${line.item}: have ${stockByItem.get(line.item.toString()) || 0}, need ${line.qty}`);
        if (errors.length > 0) throw httpError(errors.join('; '), 400, errors);

        for (const line of normalizedItems) {
          const row = await WarehouseStock.findOneAndUpdate(
            { warehouse: warehouseId, item: line.item, qty: { $gte: line.qty } },
            { $inc: { qty: -line.qty } },
            { new: true, session },
          );
          if (!row) {
            throw httpError(`Insufficient stock for item ${line.item}: need ${line.qty}`);
          }
        }

        code = await nextBoxCode(session);
        qrToken = uuidv4();
        [box] = await Box.create(
          [{ code, qrToken, warehouse: warehouseId, destinationStore, items: normalizedItems }],
          { session },
        );

        await HandoverLog.create([{
          box: box._id,
          actor: req.user.id,
          action: 'BOX_PACKED',
          meta: { code, destinationStore, items: normalizedItems },
        }], { session });
      });
    } catch (error) {
      if (error.code === 11000 && attempt < 2) continue;
      const body = { message: error.message || 'Unable to create box' };
      if (error.errors) body.errors = error.errors;
      return res.status(error.status || (error.code === 11000 ? 409 : 500)).json(body);
    } finally {
      await session.endSession();
    }
  }

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

  const { driverId, expectedArrival } = req.body;
  if (!driverId) return res.status(400).json({ message: 'driverId is required' });

  // Validate driverId body param is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return res.status(400).json({ message: 'driverId must be a valid id' });
  }

  let expectedArrivalDate;
  if (expectedArrival) {
    expectedArrivalDate = new Date(expectedArrival);
    if (Number.isNaN(expectedArrivalDate.getTime())) {
      return res.status(400).json({ message: 'expectedArrival is not a valid date' });
    }
  }

  const driver = await User.findOne({ _id: driverId, role: 'driver' });
  if (!driver) return res.status(404).json({ message: 'Driver not found' });

  const box = await Box.findOne({ _id: req.params.id, warehouse: req.user.warehouse, status: 'PACKED' });
  if (!box) return res.status(400).json({ message: 'Box not found or not eligible for assignment' });

  box.status = 'ASSIGNED';
  box.assignedDriver = driver._id;
  if (expectedArrivalDate) box.expectedArrival = expectedArrivalDate;
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
