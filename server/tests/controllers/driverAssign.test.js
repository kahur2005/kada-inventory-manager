require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function makePackedBox(wh, store, code) {
  const item = await Item.create({ name: `I-${code}`, sku: `SKU-${code}` });
  return Box.create({ code, qrToken: `t-${code}`, warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
}

describe('GET /api/drivers', () => {
  test('warehouse_admin lists drivers with just id and name', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'Dri', email: 'dri@example.com', passwordHash: 'x', role: 'driver' });
    await User.create({ name: 'Other', email: 'other@example.com', passwordHash: 'x', role: 'store_admin' });

    const res = await request(app).get('/api/drivers').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.drivers).toHaveLength(1);
    expect(res.body.drivers[0]).toEqual({ id: expect.any(String), name: 'Dri' });
  });
});

describe('POST /api/scan/driver', () => {
  test('assigns all requested PACKED boxes to the scanned driver', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token' });
    const box1 = await makePackedBox(wh, store, 'BX-A1');
    const box2 = await makePackedBox(wh, store, 'BX-A2');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token', boxIds: [box1._id.toString(), box2._id.toString()] });

    expect(res.status).toBe(200);
    const updated1 = await Box.findById(box1._id);
    const updated2 = await Box.findById(box2._id);
    expect(updated1.status).toBe('ASSIGNED');
    expect(updated1.assignedDriver.toString()).toBe(driver._id.toString());
    expect(updated2.status).toBe('ASSIGNED');
    const logs = await HandoverLog.find({ action: 'DRIVER_ASSIGNED' });
    expect(logs).toHaveLength(1);
  });

  test('rejects an unrecognized driver token', async () => {
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S-WH3', address: 'x' });
    const whAdmin = await User.create({ name: 'WA3', email: 'wa3@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const box = await makePackedBox(wh, store, 'BX-A0');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'nope', boxIds: [box._id.toString()] });
    expect(res.status).toBe(400);

    const stillPacked = await Box.findById(box._id);
    expect(stillPacked.status).toBe('PACKED');
  });

  test('rejects a box from a different warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH4', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH5', address: 'y' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const whAdmin = await User.create({ name: 'WA4', email: 'wa4@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token-2' });
    const foreignBox = await makePackedBox(otherWh, store, 'BX-A3');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token-2', boxIds: [foreignBox._id.toString()] });
    expect(res.status).toBe(400);
  });

  test('rejects when boxIds array contains malformed ObjectId', async () => {
    const wh = await Warehouse.create({ name: 'WH-MALFORMED', address: 'x' });
    const whAdmin = await User.create({ name: 'WA-MALFORMED', email: 'wa-malformed@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'D-MALFORMED', email: 'd-malformed@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token-mal' });

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token-mal', boxIds: ['not-a-valid-objectid'] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/boxes/:id/assign (manual fallback)', () => {
  test('assigns a single box to a driver by id', async () => {
    const wh = await Warehouse.create({ name: 'WH6', address: 'x' });
    const store = await Store.create({ name: 'S3', address: 'x' });
    const whAdmin = await User.create({ name: 'WA5', email: 'wa5@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const box = await makePackedBox(wh, store, 'BX-A4');

    const res = await request(app)
      .post(`/api/boxes/${box._id}/assign`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ driverId: driver._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.box.status).toBe('ASSIGNED');
  });

  test('rejects with 400 when driverId in body is malformed ObjectId', async () => {
    const wh = await Warehouse.create({ name: 'WH-MAL-DRIVER', address: 'x' });
    const store = await Store.create({ name: 'S-MAL-DRIVER', address: 'x' });
    const whAdmin = await User.create({ name: 'WA-MAL-DRIVER', email: 'wa-mal-driver@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const box = await makePackedBox(wh, store, 'BX-MAL-DRIVER');

    const res = await request(app)
      .post(`/api/boxes/${box._id}/assign`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ driverId: 'malformed-driver-id' });

    expect(res.status).toBe(400);
  });

  test('rejects with 404 when :id path param is malformed ObjectId', async () => {
    const wh = await Warehouse.create({ name: 'WH-MAL-BOX', address: 'x' });
    const whAdmin = await User.create({ name: 'WA-MAL-BOX', email: 'wa-mal-box@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D-MAL-BOX', email: 'd-mal-box@example.com', passwordHash: 'x', role: 'driver' });

    const res = await request(app)
      .post('/api/boxes/malformed-box-id/assign')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ driverId: driver._id.toString() });

    expect(res.status).toBe(404);
  });
});
