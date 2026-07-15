const mongoose = require('mongoose');
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');
const StockHistory = require('../models/StockHistory');

async function listWarehouseStock(req, res) {
  const { warehouse } = req.query;
  if (!warehouse) {
    return res.status(400).json({ message: 'warehouse query param is required' });
  }
  // Validate warehouse is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(warehouse)) {
    return res.status(400).json({ message: 'warehouse must be a valid id' });
  }
  if (req.user.role === 'warehouse_admin' && req.user.warehouse !== warehouse) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await WarehouseStock.find({ warehouse }).populate('item', 'name sku unit volumeM3');
  res.json({ warehouseStock: rows });
}

async function addWarehouseStock(req, res) {
  const { warehouse, item, qty } = req.body;
  if (!warehouse || !item || !qty || qty <= 0) {
    return res.status(400).json({ message: 'warehouse, item, and a positive qty are required' });
  }
  // Validate warehouse is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(warehouse)) {
    return res.status(400).json({ message: 'warehouse must be a valid id' });
  }
  // Validate item is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(item)) {
    return res.status(400).json({ message: 'item must be a valid id' });
  }
  const row = await WarehouseStock.findOneAndUpdate(
    { warehouse, item },
    { $inc: { qty } },
    { upsert: true, new: true }
  ).populate('item', 'name sku unit volumeM3');
  await HandoverLog.create({
    actor: req.user.id,
    action: 'WAREHOUSE_STOCK_ADDED',
    meta: { warehouse, item, qtyAdded: qty },
  });
  await StockHistory.create({
    stockType: 'warehouse',
    warehouse,
    item,
    qty: row.qty,
    changeDelta: qty,
    reason: 'RESTOCK',
  });
  res.status(201).json({ warehouseStock: row });
}

module.exports = { listWarehouseStock, addWarehouseStock };
