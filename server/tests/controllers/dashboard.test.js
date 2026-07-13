require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const WarehouseStock = require('../../models/WarehouseStock');
const StoreStock = require('../../models/StoreStock');
const { signToken } = require('../../middleware/auth');

describe('GET /api/dashboard/stats', () => {
  test('aggregates box status counts, user count, alerts, and utilization', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await User.create({ name: 'U2', email: 'u2@example.com', passwordHash: 'x', role: 'driver' });

    const wh = await Warehouse.create({ name: 'WH', address: 'x', capacityM3: 100 });
    const store = await Store.create({ name: 'S1', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1', volumeM3: 1 });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 20 });

    await Box.create({ code: 'BX-D1', qrToken: 't1', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'PACKED' });
    await Box.create({ code: 'BX-D2', qrToken: 't2', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'DELIVERED' });

    const lowItem = await Item.create({ name: 'Low', sku: 'LOW1' });
    await StoreStock.create({ store: store._id, item: lowItem._id, qty: 1, threshold: 10 });

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.boxesByStatus).toEqual({ PACKED: 1, ASSIGNED: 0, IN_TRANSIT: 0, DELIVERED: 1 });
    expect(res.body.totalUsers).toBe(2);
    expect(res.body.lowStockAlerts).toBe(1);
    expect(res.body.warehouseUtilizationPct).toBe(20); // 20 qty * 1 volumeM3 = 20m3 used of 100m3 capacity
  });

  test('non-superadmin cannot read dashboard stats', async () => {
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin' });
    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });
});
