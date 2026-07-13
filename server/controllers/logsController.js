const mongoose = require('mongoose');
const HandoverLog = require('../models/HandoverLog');
const Box = require('../models/Box');

async function listLogs(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const { box, store } = req.query;

  // Validate box query param if present
  if (box && !mongoose.Types.ObjectId.isValid(box)) {
    return res.status(400).json({ message: 'Invalid box ID format' });
  }

  // Validate store query param if present
  if (store && !mongoose.Types.ObjectId.isValid(store)) {
    return res.status(400).json({ message: 'Invalid store ID format' });
  }

  let filter = {};
  if (req.user.role === 'store_admin') {
    filter = { actor: req.user.id };
  } else if (req.user.role === 'warehouse_admin') {
    const boxesInWarehouse = await Box.find({ warehouse: req.user.warehouse }).select('_id');
    filter = { $or: [{ actor: req.user.id }, { box: { $in: boxesInWarehouse.map((b) => b._id) } }] };
  }

  const extra = {};
  if (box) extra.box = box;
  if (store) {
    const boxesForStore = await Box.find({ destinationStore: store }).select('_id');
    extra.box = { $in: boxesForStore.map((b) => b._id) };
  }

  const finalFilter = Object.keys(extra).length > 0 ? { $and: [filter, extra] } : filter;

  const [logs, total] = await Promise.all([
    HandoverLog.find(finalFilter)
      .populate('actor', 'name role')
      .populate('box', 'code')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    HandoverLog.countDocuments(finalFilter),
  ]);

  res.json({ logs, total, page, limit });
}

module.exports = { listLogs };
