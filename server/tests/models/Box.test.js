require('../setup');
const Box = require('../../models/Box');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');

test('creates a box with default status PACKED', async () => {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const store = await Store.create({ name: 'S', address: 'x' });
  const item = await Item.create({ name: 'A', sku: 'B1' });
  const box = await Box.create({
    code: 'BX-0001',
    qrToken: 'token-1',
    warehouse: wh._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 10 }],
  });
  expect(box.status).toBe('PACKED');
  expect(box.assignedDriver).toBeNull();
  expect(box.items[0].qty).toBe(10);
});

test('rejects invalid status', async () => {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const store = await Store.create({ name: 'S', address: 'x' });
  await expect(
    Box.create({ code: 'BX-0002', qrToken: 'token-2', warehouse: wh._id, destinationStore: store._id, status: 'LOST' })
  ).rejects.toThrow();
});

test('rejects duplicate code', async () => {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const store = await Store.create({ name: 'S', address: 'x' });
  await Box.create({ code: 'BX-DUP', qrToken: 'tok-a', warehouse: wh._id, destinationStore: store._id });
  await expect(
    Box.create({ code: 'BX-DUP', qrToken: 'tok-b', warehouse: wh._id, destinationStore: store._id })
  ).rejects.toThrow();
});
