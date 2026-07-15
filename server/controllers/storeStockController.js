const mongoose = require('mongoose');
const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');
const HandoverLog = require('../models/HandoverLog');
const StockHistory = require('../models/StockHistory');

async function canReadStore(req, storeId) {
  if (req.user.role === 'superadmin') return true;
  if (req.user.role === 'store_admin') return req.user.store === storeId.toString();
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    return !!wh && wh.stores.some((s) => s.toString() === storeId.toString());
  }
  return false;
}

async function listStoreStock(req, res) {
  const { store } = req.query;
  if (!store) {
    return res.status(400).json({ message: 'store query param is required' });
  }
  // Validate store is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(store)) {
    return res.status(400).json({ message: 'store must be a valid id' });
  }
  if (!(await canReadStore(req, store))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await StoreStock.find({ store }).populate('item', 'name sku unit');
  const withFlag = rows.map((row) => ({ ...row.toObject(), belowThreshold: row.qty < row.threshold }));
  res.json({ storeStock: withFlag });
}

async function adjustStoreStock(req, res) {
  const { qty } = req.body;
  if (qty === undefined || qty < 0) {
    return res.status(400).json({ message: 'a non-negative qty is required' });
  }
  // Validate id is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Store stock row not found' });
  }
  if (req.user.role !== 'store_admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const row = await StoreStock.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Store stock row not found' });
  if (req.user.store !== row.store.toString()) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const oldQty = row.qty;
  row.qty = qty;
  await row.save();
  await HandoverLog.create({
    actor: req.user.id,
    action: 'STOCK_ADJUSTED',
    meta: { storeStockId: row._id.toString(), oldQty, newQty: qty },
  });
  await StockHistory.create({
    stockType: 'store',
    store: row.store,
    item: row.item,
    qty,
    changeDelta: qty - oldQty,
    reason: 'ADJUSTMENT',
  });
  res.json({ storeStock: row });
}

async function setThreshold(req, res) {
  const { threshold } = req.body;
  if (threshold === undefined || threshold < 0) {
    return res.status(400).json({ message: 'a non-negative threshold is required' });
  }
  // Validate id is a well-formed ObjectId before querying
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Store stock row not found' });
  }
  if (!['superadmin', 'warehouse_admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const row = await StoreStock.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Store stock row not found' });
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    const owns = !!wh && wh.stores.some((s) => s.toString() === row.store.toString());
    if (!owns) return res.status(403).json({ message: 'Forbidden' });
  }
  row.threshold = threshold;
  await row.save();
  res.json({ storeStock: row });
}

module.exports = { listStoreStock, adjustStoreStock, setThreshold };
