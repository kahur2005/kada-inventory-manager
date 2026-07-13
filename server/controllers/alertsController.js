const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');

async function listAlerts(req, res) {
  let filter = {};
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    filter = { store: { $in: wh ? wh.stores : [] } };
  }
  const rows = await StoreStock.find(filter).populate('item', 'name sku unit').populate('store', 'name address');
  const alerts = rows.filter((row) => row.qty < row.threshold);
  res.json({ alerts });
}

module.exports = { listAlerts };
