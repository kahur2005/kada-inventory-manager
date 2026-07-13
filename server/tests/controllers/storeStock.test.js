require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const StoreStock = require('../../models/StoreStock');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

describe('Store stock', () => {
  test('GET returns belowThreshold flag and is scoped for store_admin', async () => {
    const store = await Store.create({ name: 'S1', address: 'x' });
    const otherStore = await Store.create({ name: 'S2', address: 'y' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    await StoreStock.create({ store: otherStore._id, item: item._id, qty: 20, threshold: 5 });

    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app).get(`/api/store-stock?store=${store._id}`).set('Authorization', `Bearer ${signToken(storeAdmin)}`);

    expect(res.status).toBe(200);
    expect(res.body.storeStock).toHaveLength(1);
    expect(res.body.storeStock[0].belowThreshold).toBe(true);
    expect(res.body.storeStock[0]._id).toBe(row._id.toString());
  });

  test('store_admin cannot read another store\'s stock', async () => {
    const store = await Store.create({ name: 'S3', address: 'x' });
    const otherStore = await Store.create({ name: 'S4', address: 'y' });
    const storeAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app).get(`/api/store-stock?store=${otherStore._id}`).set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.status).toBe(403);
  });

  test('opname: store_admin adjusts qty and logs STOCK_ADJUSTED', async () => {
    const store = await Store.create({ name: 'S5', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA3', email: 'sa3@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });

    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/adjust`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ qty: 9 });

    expect(res.status).toBe(200);
    expect(res.body.storeStock.qty).toBe(9);
    const logs = await HandoverLog.find({ action: 'STOCK_ADJUSTED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toEqual({ storeStockId: row._id.toString(), oldQty: 3, newQty: 9 });
  });

  test('opname: store_admin cannot adjust another store\'s row', async () => {
    const store = await Store.create({ name: 'S6', address: 'x' });
    const otherStore = await Store.create({ name: 'S7', address: 'y' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const row = await StoreStock.create({ store: otherStore._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA4', email: 'sa4@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/adjust`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ qty: 1 });
    expect(res.status).toBe(403);
  });

  test('threshold: warehouse_admin sets threshold for a linked store', async () => {
    const store = await Store.create({ name: 'S8', address: 'x' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x', stores: [store._id] });
    const item = await Item.create({ name: 'D', sku: 'D1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });

    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/threshold`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ threshold: 20 });

    expect(res.status).toBe(200);
    expect(res.body.storeStock.threshold).toBe(20);
  });

  test('threshold: store_admin cannot set threshold', async () => {
    const store = await Store.create({ name: 'S9', address: 'x' });
    const item = await Item.create({ name: 'E', sku: 'E1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA5', email: 'sa5@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/threshold`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ threshold: 1 });
    expect(res.status).toBe(403);
  });

  // Regression tests for malformed ObjectId validation
  test('GET /api/store-stock rejects malformed store id', async () => {
    const admin = await User.create({ name: 'SA6', email: 'sa6@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .get('/api/store-stock?store=not-a-valid-id')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/store.*valid.*id/i);
  });

  test('PATCH /api/store-stock/:id/adjust rejects malformed id', async () => {
    const store = await Store.create({ name: 'S10', address: 'x' });
    const storeAdmin = await User.create({ name: 'SA7', email: 'sa7@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .patch('/api/store-stock/not-a-valid-id/adjust')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ qty: 5 });
    expect(res.status).toBe(404);
  });

  test('PATCH /api/store-stock/:id/threshold rejects malformed id', async () => {
    const admin = await User.create({ name: 'SA8', email: 'sa8@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .patch('/api/store-stock/not-a-valid-id/threshold')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ threshold: 5 });
    expect(res.status).toBe(404);
  });
});
