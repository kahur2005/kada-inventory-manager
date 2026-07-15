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

describe('GET /api/logs', () => {
  test('superadmin sees all logs', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await HandoverLog.create({ actor: admin._id, action: 'WAREHOUSE_STOCK_ADDED', meta: {} });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {} });

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('store_admin only sees logs they authored', async () => {
    const store = await Store.create({ name: 'S1', address: 'x' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const otherAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin' });
    await HandoverLog.create({ actor: storeAdmin._id, action: 'STOCK_ADJUSTED', meta: { oldQty: 1, newQty: 2 } });
    await HandoverLog.create({ actor: otherAdmin._id, action: 'STOCK_ADJUSTED', meta: { oldQty: 3, newQty: 4 } });

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].meta.newQty).toBe(2);
  });

  test('warehouse_admin sees logs they authored plus logs for boxes from their warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });

    const boxInScope = await Box.create({ code: 'BX-L1', qrToken: 't1', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    const boxOutOfScope = await Box.create({ code: 'BX-L2', qrToken: 't2', warehouse: otherWh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });

    await HandoverLog.create({ box: boxInScope._id, actor: whAdmin._id, action: 'BOX_PACKED', meta: {} });
    await HandoverLog.create({ box: boxInScope._id, actor: driver._id, action: 'PICKED_UP', meta: {} }); // authored by driver, but box is in scope
    await HandoverLog.create({ box: boxOutOfScope._id, actor: driver._id, action: 'PICKED_UP', meta: {} }); // out of scope entirely
    // Authored by whAdmin but box is in ANOTHER warehouse (out of box-ownership scope) — isolates the
    // "authored by me" OR-branch: this must still be included on the strength of authorship alone,
    // proving the $or isn't accidentally collapsing to just the box-ownership condition.
    await HandoverLog.create({ box: boxOutOfScope._id, actor: whAdmin._id, action: 'PICKED_UP', meta: {} });

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.body.logs).toHaveLength(3);
    // Sanity: the authored-but-out-of-warehouse-box log is genuinely present, proving the
    // "authored by me" clause grants access independent of box ownership.
    const authoredOutOfScopeLogs = res.body.logs.filter(
      (l) => l.actor._id === whAdmin._id.toString() && l.box && l.box._id === boxOutOfScope._id.toString()
    );
    expect(authoredOutOfScopeLogs).toHaveLength(1);
  });

  test('filters by box id', async () => {
    const admin = await User.create({ name: 'S3', email: 's3@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S3s', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const box = await Box.create({ code: 'BX-L3', qrToken: 't3', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    await HandoverLog.create({ box: box._id, actor: admin._id, action: 'BOX_PACKED', meta: {} });
    await HandoverLog.create({ actor: admin._id, action: 'WAREHOUSE_STOCK_ADDED', meta: {} });

    const res = await request(app).get(`/api/logs?box=${box._id}`).set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.logs).toHaveLength(1);
  });

  test('filters by store id', async () => {
    const admin = await User.create({ name: 'S6', email: 's6@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH6', address: 'x' });
    const storeA = await Store.create({ name: 'StoreA', address: 'x' });
    const storeB = await Store.create({ name: 'StoreB', address: 'y' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const boxForStoreA = await Box.create({ code: 'BX-L6A', qrToken: 't6a', warehouse: wh._id, destinationStore: storeA._id, items: [{ item: item._id, qty: 1 }] });
    const boxForStoreB = await Box.create({ code: 'BX-L6B', qrToken: 't6b', warehouse: wh._id, destinationStore: storeB._id, items: [{ item: item._id, qty: 1 }] });
    await HandoverLog.create({ box: boxForStoreA._id, actor: admin._id, action: 'BOX_PACKED', meta: {} });
    await HandoverLog.create({ box: boxForStoreB._id, actor: admin._id, action: 'BOX_PACKED', meta: {} });

    const res = await request(app).get(`/api/logs?store=${storeA._id}`).set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].box._id).toBe(boxForStoreA._id.toString());
  });

  test('returns 400 when box query param is malformed ObjectId', async () => {
    const admin = await User.create({ name: 'S4', email: 's4@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?box=malformed-id').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('returns 400 when store query param is malformed ObjectId', async () => {
    const admin = await User.create({ name: 'S5', email: 's5@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?store=invalid-store-id').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('filters by from/to timestamp range, inclusive of the to day', async () => {
    const admin = await User.create({ name: 'S7', email: 's7@example.com', passwordHash: 'x', role: 'superadmin' });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-01-10T10:00:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-02-10T10:00:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-02-20T23:30:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-03-10T10:00:00Z') });

    const res = await request(app)
      .get('/api/logs?from=2026-02-01&to=2026-02-20')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
  });

  test('returns 400 for an unparseable from date', async () => {
    const admin = await User.create({ name: 'S8', email: 's8@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?from=not-a-date').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('returns 400 for an unparseable to date', async () => {
    const admin = await User.create({ name: 'S9', email: 's9@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?to=not-a-date').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });
});
