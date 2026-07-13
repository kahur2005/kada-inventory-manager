const Box = require('../models/Box');
const User = require('../models/User');
const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');
const WarehouseStock = require('../models/WarehouseStock');

const STATUSES = ['PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];

async function stats(req, res) {
  const [boxesByStatusAgg, totalUsers, storeStockRows, warehouses] = await Promise.all([
    Box.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments(),
    StoreStock.find(),
    Warehouse.find(),
  ]);

  const boxesByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  boxesByStatusAgg.forEach((row) => {
    boxesByStatus[row._id] = row.count;
  });

  const lowStockAlerts = storeStockRows.filter((row) => row.qty < row.threshold).length;

  let totalUsedM3 = 0;
  let totalCapacityM3 = 0;
  for (const wh of warehouses) {
    const rows = await WarehouseStock.find({ warehouse: wh._id }).populate('item', 'volumeM3');
    totalUsedM3 += rows.reduce((sum, row) => sum + (row.item?.volumeM3 || 0) * row.qty, 0);
    totalCapacityM3 += wh.capacityM3 || 0;
  }
  const warehouseUtilizationPct = totalCapacityM3 > 0 ? Math.round((totalUsedM3 / totalCapacityM3) * 100) : 0;

  res.json({ boxesByStatus, totalUsers, lowStockAlerts, warehouseUtilizationPct });
}

module.exports = { stats };
