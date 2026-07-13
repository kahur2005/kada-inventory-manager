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

describe('POST /api/driver-location', () => {
  test('upserts the driver\'s own location', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res1 = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({ coords: { lat: 1, lng: 2 } });
    expect(res1.status).toBe(200);
    const res2 = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({ coords: { lat: 3, lng: 4 } });
    expect(res2.status).toBe(200);

    const count = await DriverLocation.countDocuments({ driver: driver._id });
    expect(count).toBe(1);
    const doc = await DriverLocation.findOne({ driver: driver._id });
    expect(doc.coords.lat).toBe(3);
  });

  test('rejects missing coords', async () => {
    const driver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/driver-locations', () => {
  test('warehouse_admin only sees drivers assigned to boxes from their warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const driverInScope = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const driverOutOfScope = await User.create({ name: 'D4', email: 'd4@example.com', passwordHash: 'x', role: 'driver' });
    await Box.create({ code: 'BX-DL1', qrToken: 't1', warehouse: wh1._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'ASSIGNED', assignedDriver: driverInScope._id });
    await Box.create({ code: 'BX-DL2', qrToken: 't2', warehouse: wh2._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'ASSIGNED', assignedDriver: driverOutOfScope._id });
    await DriverLocation.create({ driver: driverInScope._id, coords: { lat: 1, lng: 1 } });
    await DriverLocation.create({ driver: driverOutOfScope._id, coords: { lat: 2, lng: 2 } });

    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(whAdmin)}`);

    expect(res.status).toBe(200);
    expect(res.body.driverLocations).toHaveLength(1);
    expect(res.body.driverLocations[0].driver.name).toBe('D3');
  });

  test('superadmin sees all driver locations', async () => {
    const driver = await User.create({ name: 'D5', email: 'd5@example.com', passwordHash: 'x', role: 'driver' });
    await DriverLocation.create({ driver: driver._id, coords: { lat: 1, lng: 1 } });
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });

    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.driverLocations).toHaveLength(1);
  });

  test('driver cannot list all driver locations', async () => {
    const driver = await User.create({ name: 'D6', email: 'd6@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });
});
