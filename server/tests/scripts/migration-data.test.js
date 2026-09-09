const { buildManifest, validateSnapshot } = require('../../scripts/migration-data');

function validSnapshot() {
  const warehouse = { _id: 'wh1', name: 'Main', address: 'A', coords: { lat: 1, lng: 2 }, stores: ['store1'], capacityM3: 10, areaM2: 20 };
  const store = { _id: 'store1', name: 'Shop', address: 'B', coords: { lat: 3, lng: 4 } };
  const item = { _id: 'item1', name: 'Rice', sku: 'RICE', unit: 'kg', volumeM3: 0.01 };
  const user = { _id: 'user1', name: 'Driver', email: 'driver@example.com', role: 'driver' };
  return {
    users: [user],
    warehouses: [warehouse],
    stores: [store],
    items: [item],
    warehouseStocks: [{ _id: 'whstock1', warehouse: 'wh1', item: 'item1', qty: 10 }],
    storeStocks: [{ _id: 'storestock1', store: 'store1', item: 'item1', qty: 2, threshold: 1, maxLevel: 10 }],
    boxes: [{ _id: 'box1', code: 'BOX-1', qrToken: 'qr-1', warehouse: 'wh1', destinationStore: 'store1', assignedDriver: 'user1', status: 'ASSIGNED', items: [{ item: 'item1', qty: 2 }] }],
    handoverLogs: [{ _id: 'log1', box: 'box1', actor: 'user1', action: 'DRIVER_ASSIGNED', coords: { lat: 1, lng: 2 }, timestamp: '2026-01-01T00:00:00.000Z' }],
    stockHistories: [{ _id: 'history1', stockType: 'warehouse', warehouse: 'wh1', item: 'item1', qty: 10, changeDelta: 10, reason: 'INITIAL' }],
    driverLocations: [{ _id: 'location1', driver: 'user1', name: 'Driver', coords: { lat: 1, lng: 2 }, heading: 0, speedKph: 0, status: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' }],
  };
}

test('accepts a relationally importable snapshot', () => {
  const snapshot = validSnapshot();
  expect(validateSnapshot(snapshot)).toEqual([]);
  expect(buildManifest(snapshot).valid).toBe(true);
});

test('reports duplicate keys and dangling relationships without throwing', () => {
  const snapshot = validSnapshot();
  snapshot.items.push({ ...snapshot.items[0], _id: 'item2' });
  snapshot.warehouseStocks[0].item = 'missing-item';
  snapshot.boxes[0].items.push({ item: 'item1', qty: 1 });
  const errors = validateSnapshot(snapshot);
  expect(errors.some((error) => error.includes('sku: duplicate value'))).toBe(true);
  expect(errors.some((error) => error.includes('dangling reference'))).toBe(true);
  expect(errors.some((error) => error.includes('duplicate value item1'))).toBe(true);
});

test('rejects invalid scopes, coordinates, quantities, and driver records', () => {
  const snapshot = validSnapshot();
  snapshot.users[0].role = 'warehouse_admin';
  snapshot.users[0].warehouse = 'wh1';
  snapshot.users[0].store = 'store1';
  snapshot.driverLocations[0].coords = { lat: 91, lng: 2 };
  snapshot.boxes[0].items[0].qty = 0;
  const errors = validateSnapshot(snapshot);
  expect(errors.some((error) => error.includes('warehouse_admin must have only a warehouse scope'))).toBe(true);
  expect(errors.some((error) => error.includes('invalid latitude'))).toBe(true);
  expect(errors.some((error) => error.includes('must be a positive number'))).toBe(true);
});
