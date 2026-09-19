require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const WarehouseStock = require('../../models/WarehouseStock');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function setup() {
  const warehouse = await Warehouse.create({ name: 'WH', address: 'A' });
  const store = await Store.create({ name: 'Store', address: 'B' });
  const item = await Item.create({ name: 'Item', sku: 'ITEM-1' });
  const admin = await User.create({
    name: 'WA',
    email: 'wa@box-integrity.test',
    passwordHash: 'x',
    role: 'warehouse_admin',
    warehouse: warehouse._id,
  });
  return { warehouse, store, item, token: signToken(admin) };
}

describe('POST /api/boxes inventory integrity', () => {
  test('merges duplicate item lines before checking and decrementing stock', async () => {
    const { warehouse, store, item, token } = await setup();
    await WarehouseStock.create({ warehouse: warehouse._id, item: item._id, qty: 5 });

    const response = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        destinationStore: store._id.toString(),
        items: [
          { item: item._id.toString(), qty: 4 },
          { item: item._id.toString(), qty: 4 },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Insufficient stock');
    const stock = await WarehouseStock.findOne({ warehouse: warehouse._id, item: item._id });
    expect(stock.qty).toBe(5);
    expect(await Box.countDocuments()).toBe(0);
  });

  test.each([0, -1, 1.5, 'not-a-number'])('rejects invalid quantity %p without changing stock', async (qty) => {
    const { warehouse, store, item, token } = await setup();
    await WarehouseStock.create({ warehouse: warehouse._id, item: item._id, qty: 5 });

    const response = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ destinationStore: store._id.toString(), items: [{ item: item._id.toString(), qty }] });

    expect(response.status).toBe(400);
    const stock = await WarehouseStock.findOne({ warehouse: warehouse._id, item: item._id });
    expect(stock.qty).toBe(5);
    expect(await Box.countDocuments()).toBe(0);
  });

  test('rolls back stock when box logging fails after the decrement', async () => {
    const { warehouse, store, item, token } = await setup();
    await WarehouseStock.create({ warehouse: warehouse._id, item: item._id, qty: 5 });
    const logCreate = jest.spyOn(HandoverLog, 'create').mockRejectedValueOnce(new Error('log unavailable'));

    const response = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ destinationStore: store._id.toString(), items: [{ item: item._id.toString(), qty: 2 }] });

    logCreate.mockRestore();
    expect(response.status).toBe(500);
    expect((await WarehouseStock.findOne({ warehouse: warehouse._id, item: item._id })).qty).toBe(5);
    expect(await Box.countDocuments()).toBe(0);
  });

  test('keeps concurrent box codes unique', async () => {
    const { warehouse, store, item, token } = await setup();
    await WarehouseStock.create({ warehouse: warehouse._id, item: item._id, qty: 2 });
    const payload = { destinationStore: store._id.toString(), items: [{ item: item._id.toString(), qty: 1 }] };

    const responses = await Promise.all([
      request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send(payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect(new Set(responses.map((response) => response.body.box.code)).size).toBe(2);
    expect((await WarehouseStock.findOne({ warehouse: warehouse._id, item: item._id })).qty).toBe(0);
  });
});
