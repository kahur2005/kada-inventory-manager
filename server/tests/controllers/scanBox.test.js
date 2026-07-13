require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const StoreStock = require('../../models/StoreStock');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function setup(status = 'ASSIGNED') {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const store = await Store.create({ name: 'S', address: 'x' });
  const item = await Item.create({ name: 'Indomie', sku: 'IND1' });
  const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
  const box = await Box.create({
    code: 'BX-S1',
    qrToken: 'scan-token-1',
    warehouse: wh._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 10 }],
    status,
  });
  return { wh, store, item, storeAdmin, box };
}

describe('POST /api/scan/box', () => {
  test('delivers via scanned token: upserts StoreStock, marks DELIVERED, logs', async () => {
    const { store, item, storeAdmin, box } = await setup();
    const res = await request(app)
      .post('/api/scan/box')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ token: 'scan-token-1', coords: { lat: -6.2, lng: 106.8 } });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ name: 'Indomie', qty: 10 }]);

    const stockRow = await StoreStock.findOne({ store: store._id, item: item._id });
    expect(stockRow.qty).toBe(10);

    const updatedBox = await Box.findById(box._id);
    expect(updatedBox.status).toBe('DELIVERED');

    const logs = await HandoverLog.find({ action: 'DELIVERED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].coords.lat).toBe(-6.2);
  });

  test('delivers via manual code fallback', async () => {
    const { storeAdmin } = await setup();
    const res = await request(app)
      .post('/api/scan/box')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ code: 'bx-s1' });
    expect(res.status).toBe(200);
  });

  test('increments existing StoreStock rather than overwriting', async () => {
    const { store, item, storeAdmin } = await setup();
    await StoreStock.create({ store: store._id, item: item._id, qty: 5, threshold: 3 });
    await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'scan-token-1' });
    const row = await StoreStock.findOne({ store: store._id, item: item._id });
    expect(row.qty).toBe(15);
    expect(row.threshold).toBe(3); // untouched
  });

  test('rejects wrong store', async () => {
    const { box } = await setup();
    const otherStore = await Store.create({ name: 'Other', address: 'y' });
    const otherAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin', store: otherStore._id });
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(otherAdmin)}`).send({ token: 'scan-token-1' });
    expect(res.status).toBe(403);
  });

  test('rejects an already-delivered box', async () => {
    const { storeAdmin } = await setup('DELIVERED');
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'scan-token-1' });
    expect(res.status).toBe(400);
  });

  test('rejects an unrecognized token', async () => {
    const { storeAdmin } = await setup();
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'nope' });
    expect(res.status).toBe(404);
  });
});
