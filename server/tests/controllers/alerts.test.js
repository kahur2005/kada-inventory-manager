require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const StoreStock = require('../../models/StoreStock');
const { signToken } = require('../../middleware/auth');

describe('GET /api/alerts', () => {
  test('superadmin sees all below-threshold rows', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const store = await Store.create({ name: 'S1', address: 'x' });
    const lowItem = await Item.create({ name: 'Low', sku: 'LOW1' });
    const okItem = await Item.create({ name: 'Ok', sku: 'OK1' });
    await StoreStock.create({ store: store._id, item: lowItem._id, qty: 2, threshold: 10 });
    await StoreStock.create({ store: store._id, item: okItem._id, qty: 20, threshold: 5 });

    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].item.name).toBe('Low');
  });

  test('warehouse_admin only sees alerts for their linked stores', async () => {
    const store1 = await Store.create({ name: 'S2', address: 'x' });
    const store2 = await Store.create({ name: 'S3', address: 'y' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x', stores: [store1._id] });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const item2 = await Item.create({ name: 'C', sku: 'C1' });
    await StoreStock.create({ store: store1._id, item: item._id, qty: 1, threshold: 5 });
    await StoreStock.create({ store: store2._id, item: item2._id, qty: 1, threshold: 5 });

    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].store.name).toBe('S2');
  });

  test('driver cannot read alerts', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });
});
