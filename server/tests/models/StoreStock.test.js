require('../setup');
const StoreStock = require('../../models/StoreStock');
const Store = require('../../models/Store');
const Item = require('../../models/Item');

test('creates a store stock row with threshold', async () => {
  const store = await Store.create({ name: 'S', address: 'x' });
  const item = await Item.create({ name: 'A', sku: 'S3' });
  const row = await StoreStock.create({ store: store._id, item: item._id, qty: 2, threshold: 10 });
  expect(row.qty).toBeLessThan(row.threshold);
});

test('rejects duplicate (store, item) pair', async () => {
  const store = await Store.create({ name: 'S', address: 'x' });
  const item = await Item.create({ name: 'A', sku: 'S4' });
  await StoreStock.create({ store: store._id, item: item._id, qty: 1, threshold: 1 });
  await expect(StoreStock.create({ store: store._id, item: item._id, qty: 2, threshold: 2 })).rejects.toThrow();
});
