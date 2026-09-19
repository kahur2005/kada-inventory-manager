require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const DriverLocation = require('../../models/DriverLocation');
const { signToken } = require('../../middleware/auth');

async function setup() {
  const [store1, store2] = await Store.create([
    { name: 'S1', address: 'A' },
    { name: 'S2', address: 'B' },
  ]);
  const [warehouse1, warehouse2] = await Warehouse.create([
    { name: 'WH1', address: 'A', stores: [store1._id] },
    { name: 'WH2', address: 'B', stores: [store2._id] },
  ]);
  const item = await Item.create({ name: 'Item', sku: 'TRACK-1' });
  const [driver1, driver2] = await User.create([
    { name: 'D1', email: 'd1@tracking.test', passwordHash: 'x', role: 'driver' },
    { name: 'D2', email: 'd2@tracking.test', passwordHash: 'x', role: 'driver' },
  ]);
  const warehouseAdmin = await User.create({
    name: 'WA',
    email: 'wa@tracking.test',
    passwordHash: 'x',
    role: 'warehouse_admin',
    warehouse: warehouse1._id,
  });
  await Box.create([
    { code: 'TRACK-BOX-1', qrToken: 'track-box-1', warehouse: warehouse1._id, destinationStore: store1._id, items: [{ item: item._id, qty: 1 }], assignedDriver: driver1._id, status: 'ASSIGNED' },
    { code: 'TRACK-BOX-2', qrToken: 'track-box-2', warehouse: warehouse2._id, destinationStore: store2._id, items: [{ item: item._id, qty: 1 }], assignedDriver: driver2._id, status: 'ASSIGNED' },
  ]);
  await DriverLocation.create([
    { driver: driver1._id, name: 'D1', coords: { lat: 1, lng: 1 } },
    { driver: driver2._id, name: 'D2', coords: { lat: 2, lng: 2 } },
  ]);
  return { driver1, driver2, warehouseAdmin };
}

describe('tracking authorization and warehouse scope', () => {
  test('a driver cannot update another driver location or status', async () => {
    const { driver1, driver2 } = await setup();
    const authorization = `Bearer ${signToken(driver1)}`;

    const location = await request(app)
      .post(`/api/tracking/drivers/${driver2._id}`)
      .set('Authorization', authorization)
      .send({ lat: 9, lng: 9 });
    const status = await request(app)
      .post(`/api/tracking/drivers/${driver2._id}/status`)
      .set('Authorization', authorization)
      .send({ status: 'offline' });

    expect(location.status).toBe(403);
    expect(status.status).toBe(403);
  });

  test('a warehouse admin sees and updates only drivers from their warehouse', async () => {
    const { driver1, driver2, warehouseAdmin } = await setup();
    const authorization = `Bearer ${signToken(warehouseAdmin)}`;

    const locations = await request(app)
      .get('/api/tracking/locations')
      .set('Authorization', authorization);
    const update = await request(app)
      .post(`/api/tracking/drivers/${driver2._id}`)
      .set('Authorization', authorization)
      .send({ lat: 9, lng: 9 });

    expect(locations.status).toBe(200);
    expect(locations.body.warehouses).toHaveLength(1);
    expect(locations.body.stores).toHaveLength(1);
    expect(locations.body.drivers.map((driver) => driver.id)).toEqual([driver1._id.toString()]);
    expect(update.status).toBe(403);
  });
});
