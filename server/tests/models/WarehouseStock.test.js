require('../setup');
const WarehouseStock = require('../../models/WarehouseStock');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');

test('creates a warehouse stock row', async () => {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const item = await Item.create({ name: 'A', sku: 'S1' });
  const row = await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 10 });
  expect(row.qty).toBe(10);
});

test('rejects duplicate (warehouse, item) pair', async () => {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const item = await Item.create({ name: 'A', sku: 'S2' });
  await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 5 });
  await expect(WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 1 })).rejects.toThrow();
});
