require('../setup');
const Item = require('../../models/Item');

test('creates an item with defaults', async () => {
  const item = await Item.create({ name: 'Indomie Goreng', sku: 'SKU-001' });
  expect(item.unit).toBe('pcs');
  expect(item.volumeM3).toBeNull();
});

test('rejects duplicate sku', async () => {
  await Item.create({ name: 'A', sku: 'DUP' });
  await expect(Item.create({ name: 'B', sku: 'DUP' })).rejects.toThrow();
});

test('rejects invalid unit', async () => {
  await expect(Item.create({ name: 'A', sku: 'X1', unit: 'liters' })).rejects.toThrow();
});
