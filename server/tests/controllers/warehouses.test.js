require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const WarehouseStock = require('../../models/WarehouseStock');
const { signToken } = require('../../middleware/auth');

describe('Warehouse CRUD', () => {
  test('superadmin creates a warehouse linked to stores', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const store = await Store.create({ name: 'Store 1', address: 'A' });
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ name: 'WH A', address: 'X', coords: { lat: -6.3, lng: 106.9 }, capacityM3: 100, areaM2: 50, stores: [store._id.toString()] });
    expect(res.status).toBe(201);
    expect(res.body.warehouse.stores).toHaveLength(1);
  });

  test('warehouse_admin only sees their own warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    await Warehouse.create({ name: 'WH2', address: 'y' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.warehouses).toHaveLength(1);
    expect(res.body.warehouses[0].name).toBe('WH1');
  });

  test('computes usedM3 and utilizationPct from warehouse stock', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x', capacityM3: 100 });
    const item = await Item.create({ name: 'Box', sku: 'BOX1', volumeM3: 2 });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 10 });

    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(admin)}`);
    const found = res.body.warehouses.find((w) => w._id === wh._id.toString());
    expect(found.usedM3).toBe(20);
    expect(found.utilizationPct).toBe(20);
  });

  test('driver cannot list warehouses', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });

  test('rejects malformed id on update (returns 404, not crash)', async () => {
    const token = signToken(await User.create({ name: 'S3', email: 's3@example.com', passwordHash: 'x', role: 'superadmin' }));
    const res = await request(app)
      .patch(`/api/warehouses/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('rejects malformed id on delete (returns 404, not crash)', async () => {
    const token = signToken(await User.create({ name: 'S4', email: 's4@example.com', passwordHash: 'x', role: 'superadmin' }));
    const res = await request(app)
      .delete(`/api/warehouses/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
