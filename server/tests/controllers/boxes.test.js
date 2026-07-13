require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const WarehouseStock = require('../../models/WarehouseStock');
const Box = require('../../models/Box');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function setupWarehouseAdmin() {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
  return { wh, whAdmin, token: signToken(whAdmin) };
}

describe('POST /api/boxes', () => {
  test('creates a box, decrements warehouse stock, and logs BOX_PACKED', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S1', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 20 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ destinationStore: store._id.toString(), items: [{ item: item._id.toString(), qty: 10 }] });

    expect(res.status).toBe(201);
    expect(res.body.box.code).toBe('BX-0001');
    expect(res.body.box.status).toBe('PACKED');
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const stockRow = await WarehouseStock.findOne({ warehouse: wh._id, item: item._id });
    expect(stockRow.qty).toBe(10);

    const logs = await HandoverLog.find({ action: 'BOX_PACKED' });
    expect(logs).toHaveLength(1);
  });

  test('rejects with no partial decrement when any line item has insufficient stock', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S2', address: 'x' });
    const okItem = await Item.create({ name: 'Ok', sku: 'OK1' });
    const shortItem = await Item.create({ name: 'Short', sku: 'SH1' });
    await WarehouseStock.create({ warehouse: wh._id, item: okItem._id, qty: 100 });
    await WarehouseStock.create({ warehouse: wh._id, item: shortItem._id, qty: 2 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        destinationStore: store._id.toString(),
        items: [
          { item: okItem._id.toString(), qty: 5 },
          { item: shortItem._id.toString(), qty: 5 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);

    const okRow = await WarehouseStock.findOne({ warehouse: wh._id, item: okItem._id });
    expect(okRow.qty).toBe(100); // untouched - no partial decrement
    expect(await Box.countDocuments()).toBe(0);
  });

  test('second box in the same warehouse gets the next sequential code', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S3', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 100 });

    await request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send({ destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    const res = await request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send({ destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });

    expect(res.body.box.code).toBe('BX-0002');
  });

  test('store_admin cannot create a box', async () => {
    const store = await Store.create({ name: 'S4', address: 'x' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ destinationStore: store._id, items: [] });
    expect(res.status).toBe(403);
  });

  test('rejects with 400 when destinationStore is malformed ObjectId', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S5', address: 'x' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 50 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        destinationStore: 'not-a-valid-id',
        items: [{ item: item._id.toString(), qty: 5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('destinationStore');
    expect(await Box.countDocuments()).toBe(0);
  });

  test('rejects with 400 when item id in items array is malformed ObjectId', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S6', address: 'x' });
    const item = await Item.create({ name: 'D', sku: 'D1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 50 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        destinationStore: store._id.toString(),
        items: [{ item: 'malformed-id-here', qty: 5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('item');
    expect(await Box.countDocuments()).toBe(0);
  });
});
