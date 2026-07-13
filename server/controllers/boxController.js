const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Box = require('../models/Box');
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');
const { generateQrDataUrl } = require('../utils/qr');

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

module.exports = { createBox, nextBoxCode };
