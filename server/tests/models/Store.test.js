require('../setup');
const Store = require('../../models/Store');

test('creates a store with coords', async () => {
  const store = await Store.create({ name: 'Store 1', address: 'Jl. Sudirman', coords: { lat: -6.2, lng: 106.8 } });
  expect(store.coords.lat).toBe(-6.2);
});

test('requires name', async () => {
  await expect(Store.create({ address: 'x' })).rejects.toThrow();
});
