require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const { signToken } = require('../../middleware/auth');

async function makeBox({ warehouse, store, status = 'PACKED', assignedDriver = null, code }) {
  const item = await Item.create({ name: `Item-${code}`, sku: `SKU-${code}` });
  return Box.create({
    code,
    qrToken: `token-${code}`,
    warehouse: warehouse._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 1 }],
    status,
    assignedDriver,
  });
}

describe('GET /api/boxes', () => {
  test('warehouse_admin only sees boxes from their warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S', address: 'x' });
    await makeBox({ warehouse: wh1, store, code: 'BX-0001' });
    await makeBox({ warehouse: wh2, store, code: 'BX-0002' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0001');
  });

  test('driver only sees boxes assigned to them', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const otherDriver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    await makeBox({ warehouse: wh, store, code: 'BX-0003', status: 'ASSIGNED', assignedDriver: driver._id });
    await makeBox({ warehouse: wh, store, code: 'BX-0004', status: 'ASSIGNED', assignedDriver: otherDriver._id });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0003');
  });

  test('store_admin only sees boxes destined for their store', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store1 = await Store.create({ name: 'S3', address: 'x' });
    const store2 = await Store.create({ name: 'S4', address: 'y' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store1._id });
    await makeBox({ warehouse: wh, store: store1, code: 'BX-0005' });
    await makeBox({ warehouse: wh, store: store2, code: 'BX-0006' });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0005');
  });

  test('filters by status and searches by code', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S5', address: 'x' });
    await makeBox({ warehouse: wh, store, code: 'BX-0007', status: 'PACKED' });
    await makeBox({ warehouse: wh, store, code: 'BX-0008', status: 'DELIVERED' });

    const res = await request(app).get('/api/boxes?status=DELIVERED&search=0008').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0008');
  });
});

describe('GET /api/boxes/:id/qr', () => {
  test('regenerates the QR for a box in the admin\'s warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH4', address: 'x' });
    const store = await Store.create({ name: 'S6', address: 'x' });
    const box = await makeBox({ warehouse: wh, store, code: 'BX-0009' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });

    const res = await request(app).get(`/api/boxes/${box._id}/qr`).set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('rejects a warehouse_admin from a different warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH5', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH6', address: 'y' });
    const store = await Store.create({ name: 'S7', address: 'x' });
    const box = await makeBox({ warehouse: wh, store, code: 'BX-0010' });
    const whAdmin = await User.create({ name: 'WA3', email: 'wa3@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: otherWh._id });

    const res = await request(app).get(`/api/boxes/${box._id}/qr`).set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 for malformed id', async () => {
    const wh = await Warehouse.create({ name: 'WH7', address: 'x' });
    const whAdmin = await User.create({ name: 'WA4', email: 'wa4@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });

    const res = await request(app).get('/api/boxes/not-a-valid-id/qr').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(404);
  });
});
