require('../setup');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');

test('creates a warehouse with coords and linked stores', async () => {
  const store = await Store.create({ name: 'Store 1', address: 'Jl. Sudirman', coords: { lat: -6.2, lng: 106.8 } });
  const wh = await Warehouse.create({
    name: 'Warehouse A',
    address: 'Jl. Industri 1',
    coords: { lat: -6.3, lng: 106.9 },
    capacityM3: 500,
    areaM2: 200,
    stores: [store._id],
  });
  expect(wh.stores).toHaveLength(1);
  expect(wh.stores[0].toString()).toBe(store._id.toString());
});

test('requires name and address', async () => {
  await expect(Warehouse.create({})).rejects.toThrow();
});
