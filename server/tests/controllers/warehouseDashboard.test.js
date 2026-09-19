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

test('warehouse driver performance includes boxes assigned through QR batch scanning', async () => {
  const store = await Store.create({ name: 'S', address: 'B' });
  const warehouse = await Warehouse.create({ name: 'WH', address: 'A', stores: [store._id] });
  const item = await Item.create({ name: 'Item', sku: 'DASH-1' });
  const admin = await User.create({
    name: 'WA',
    email: 'wa@dashboard.test',
    passwordHash: 'x',
    role: 'warehouse_admin',
    warehouse: warehouse._id,
  });
  const driver = await User.create({
    name: 'Driver',
    email: 'driver@dashboard.test',
    passwordHash: 'x',
    role: 'driver',
    driverQrToken: 'dashboard-driver-token',
  });
  const box = await Box.create({
    code: 'DASH-BOX-1',
    qrToken: 'dashboard-box-token',
    warehouse: warehouse._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 1 }],
  });

  const assignedAt = new Date(Date.now() - 60 * 60 * 1000);
  await request(app)
    .post('/api/scan/driver')
    .set('Authorization', `Bearer ${signToken(admin)}`)
    .send({ token: driver.driverQrToken, boxIds: [box._id.toString()] });
  await HandoverLog.updateOne({ action: 'DRIVER_ASSIGNED' }, { timestamp: assignedAt });
  await Box.updateOne({ _id: box._id }, { status: 'DELIVERED', updatedAt: new Date() });
  await HandoverLog.create({
    box: box._id,
    actor: driver._id,
    action: 'DELIVERED',
    meta: { items: [{ item: item._id, qty: 1 }] },
    timestamp: new Date(),
  });

  const response = await request(app)
    .get('/api/dashboard/warehouse/driver-performance')
    .set('Authorization', `Bearer ${signToken(admin)}`);

  expect(response.status).toBe(200);
  expect(response.body.drivers[0].avgActualMinutes).toBe(60);
});
