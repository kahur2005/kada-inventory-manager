const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const WarehouseStock = require('../models/WarehouseStock');

async function computeUtilization(warehouse) {
  const rows = await WarehouseStock.find({ warehouse: warehouse._id }).populate('item', 'volumeM3');
  const usedM3 = rows.reduce((sum, row) => sum + (row.item?.volumeM3 || 0) * row.qty, 0);
  const utilizationPct = warehouse.capacityM3 > 0 ? Math.round((usedM3 / warehouse.capacityM3) * 100) : 0;
  return { usedM3, utilizationPct };
}

async function withUtilization(warehouses) {
  return Promise.all(
    warehouses.map(async (wh) => ({ ...wh.toObject(), ...(await computeUtilization(wh)) }))
  );
}

async function listWarehouses(req, res) {
  let warehouses;
  if (req.user.role === 'warehouse_admin') {
    warehouses = req.user.warehouse
      ? await Warehouse.find({ _id: req.user.warehouse }).populate('stores', 'name address')
      : [];
  } else {
    warehouses = await Warehouse.find().populate('stores', 'name address').sort({ name: 1 });
  }
  res.json({ warehouses: await withUtilization(warehouses) });
}

async function createWarehouse(req, res) {
  const { name, address, coords, capacityM3, areaM2, stores } = req.body;
  if (!name || !address) {
    return res.status(400).json({ message: 'name and address are required' });
  }
  const warehouse = await Warehouse.create({ name, address, coords, capacityM3, areaM2, stores });
  res.status(201).json({ warehouse });
}

async function updateWarehouse(req, res) {
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findById
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }
  const { name, address, coords, capacityM3, areaM2, stores } = req.body;
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
  if (name !== undefined) warehouse.name = name;
  if (address !== undefined) warehouse.address = address;
  if (coords !== undefined) warehouse.coords = coords;
  if (capacityM3 !== undefined) warehouse.capacityM3 = capacityM3;
  if (areaM2 !== undefined) warehouse.areaM2 = areaM2;
  if (stores !== undefined) warehouse.stores = stores;
  await warehouse.save();
  res.json({ warehouse });
}

async function deleteWarehouse(req, res) {
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findByIdAndDelete
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }
  const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
  if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
  res.json({ message: 'Warehouse deleted' });
}

module.exports = { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse };
