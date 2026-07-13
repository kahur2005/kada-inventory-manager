require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

describe('Warehouse stock', () => {
  test('superadmin adds stock, creating a row and a HandoverLog entry', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });

    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ warehouse: wh._id.toString(), item: item._id.toString(), qty: 15 });

    expect(res.status).toBe(201);
    expect(res.body.warehouseStock.qty).toBe(15);
    const logs = await HandoverLog.find({ action: 'WAREHOUSE_STOCK_ADDED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].meta.qtyAdded).toBe(15);
  });

  test('adding stock twice for the same (warehouse, item) increments qty', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    await request(app).post('/api/warehouse-stock/add').set('Authorization', `Bearer ${signToken(admin)}`).send({ warehouse: wh._id, item: item._id, qty: 5 });
    const res = await request(app).post('/api/warehouse-stock/add').set('Authorization', `Bearer ${signToken(admin)}`).send({ warehouse: wh._id, item: item._id, qty: 3 });
    expect(res.body.warehouseStock.qty).toBe(8);
  });

  test('warehouse_admin cannot read another warehouse\'s stock', async () => {
    const wh1 = await Warehouse.create({ name: 'WH3', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH4', address: 'y' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app)
      .get(`/api/warehouse-stock?warehouse=${wh2._id}`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });

  test('warehouse_admin cannot add stock', async () => {
    const wh = await Warehouse.create({ name: 'WH5', address: 'x' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ warehouse: wh._id, item: item._id, qty: 1 });
    expect(res.status).toBe(403);
  });

  test('GET /api/warehouse-stock requires warehouse query param', async () => {
    const admin = await User.create({ name: 'S3', email: 's3@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .get('/api/warehouse-stock')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/warehouse/i);
  });

  test('GET /api/warehouse-stock rejects malformed warehouse id', async () => {
    const admin = await User.create({ name: 'S4', email: 's4@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .get('/api/warehouse-stock?warehouse=not-a-valid-id')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/warehouse.*valid.*id/i);
  });

  test('POST /api/warehouse-stock/add rejects malformed warehouse id', async () => {
    const admin = await User.create({ name: 'S5', email: 's5@example.com', passwordHash: 'x', role: 'superadmin' });
    const item = await Item.create({ name: 'D', sku: 'D1' });
    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ warehouse: 'not-a-valid-id', item: item._id.toString(), qty: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/warehouse.*valid.*id/i);
  });

  test('POST /api/warehouse-stock/add rejects malformed item id', async () => {
    const admin = await User.create({ name: 'S6', email: 's6@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH6', address: 'x' });
    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ warehouse: wh._id.toString(), item: 'not-a-valid-id', qty: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/item.*valid.*id/i);
  });
});
