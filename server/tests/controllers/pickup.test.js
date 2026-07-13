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

describe('PATCH /api/boxes/:id/pickup', () => {
  test('driver picks up their assigned box', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P1',
      qrToken: 't1',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'ASSIGNED',
      assignedDriver: driver._id,
    });

    const res = await request(app)
      .patch(`/api/boxes/${box._id}/pickup`)
      .set('Authorization', `Bearer ${signToken(driver)}`)
      .send({ coords: { lat: -6.2, lng: 106.8 } });

    expect(res.status).toBe(200);
    expect(res.body.box.status).toBe('IN_TRANSIT');
    const logs = await HandoverLog.find({ action: 'PICKED_UP' });
    expect(logs).toHaveLength(1);
    expect(logs[0].coords.lat).toBe(-6.2);
  });

  test('rejects a driver picking up someone else\'s box', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const driver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    const otherDriver = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P2',
      qrToken: 't2',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'ASSIGNED',
      assignedDriver: otherDriver._id,
    });

    const res = await request(app).patch(`/api/boxes/${box._id}/pickup`).set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(403);
  });

  test('rejects picking up a box that is not ASSIGNED', async () => {
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S3', address: 'x' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const driver = await User.create({ name: 'D4', email: 'd4@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P3',
      qrToken: 't3',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'PACKED',
      assignedDriver: driver._id,
    });

    const res = await request(app).patch(`/api/boxes/${box._id}/pickup`).set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(400);
  });

  test('rejects with 404 when :id path param is malformed ObjectId', async () => {
    const driver = await User.create({ name: 'D5', email: 'd5@example.com', passwordHash: 'x', role: 'driver' });

    const res = await request(app)
      .patch('/api/boxes/malformed-box-id/pickup')
      .set('Authorization', `Bearer ${signToken(driver)}`)
      .send({});

    expect(res.status).toBe(404);
  });
});
