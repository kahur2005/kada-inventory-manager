require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const { signToken } = require('../../middleware/auth');

async function makeSuperadmin() {
  const user = await User.create({ name: 'Super', email: 'super@example.com', passwordHash: 'x', role: 'superadmin' });
  return { user, token: signToken(user) };
}

describe('GET /api/users', () => {
  test('requires superadmin', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });

  test('lists users with pagination and search', async () => {
    const { token } = await makeSuperadmin();
    await User.create({ name: 'Alice', email: 'alice@example.com', passwordHash: 'x' });
    await User.create({ name: 'Alan', email: 'alan@example.com', passwordHash: 'x' });
    await User.create({ name: 'Bob', email: 'bob@example.com', passwordHash: 'x' });

    const res = await request(app).get('/api/users?search=al&page=1&limit=10').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.users.map((u) => u.name).sort()).toEqual(['Alan', 'Alice']);
  });

  test('search with regex metacharacters does not crash and is treated literally', async () => {
    const { token } = await makeSuperadmin();
    await User.create({ name: 'Smith (Jr)', email: 'smithjr@example.com', passwordHash: 'x' });
    await User.create({ name: 'Smithsonian', email: 'smithsonian@example.com', passwordHash: 'x' });

    const res = await request(app).get('/api/users?search=Smith (').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.users.map((u) => u.name)).toEqual(['Smith (Jr)']);
  });
});

describe('POST /api/users', () => {
  test('creates a warehouse_admin scoped to a warehouse', async () => {
    const { token } = await makeSuperadmin();
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'WA', email: 'wa@example.com', password: 'x', role: 'warehouse_admin', warehouse: wh._id.toString() });
    expect(res.status).toBe(201);
    expect(res.body.user.warehouse).toBe(wh._id.toString());
  });

  test('rejects warehouse_admin without a warehouse', async () => {
    const { token } = await makeSuperadmin();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'WA', email: 'wa2@example.com', password: 'x', role: 'warehouse_admin' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/role', () => {
  test('assigns store_admin and clears warehouse', async () => {
    const { token } = await makeSuperadmin();
    const store = await Store.create({ name: 'S', address: 'x' });
    const target = await User.create({ name: 'T', email: 't@example.com', passwordHash: 'x' });

    const res = await request(app)
      .patch(`/api/users/${target._id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'store_admin', store: store._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('store_admin');
    expect(res.body.user.store).toBe(store._id.toString());
    expect(res.body.user.warehouse).toBeNull();
  });

  test('generates a driverQrToken exactly once when role becomes driver', async () => {
    const { token } = await makeSuperadmin();
    const target = await User.create({ name: 'T2', email: 't2@example.com', passwordHash: 'x' });

    const res1 = await request(app).patch(`/api/users/${target._id}/role`).set('Authorization', `Bearer ${token}`).send({ role: 'driver' });
    const firstToken = (await User.findById(target._id)).driverQrToken;
    expect(firstToken).toBeTruthy();

    const res2 = await request(app).patch(`/api/users/${target._id}/role`).set('Authorization', `Bearer ${token}`).send({ role: 'driver' });
    const secondToken = (await User.findById(target._id)).driverQrToken;
    expect(secondToken).toBe(firstToken);
  });

  test('rejects invalid role', async () => {
    const { token } = await makeSuperadmin();
    const target = await User.create({ name: 'T3', email: 't3@example.com', passwordHash: 'x' });
    const res = await request(app).patch(`/api/users/${target._id}/role`).set('Authorization', `Bearer ${token}`).send({ role: 'wizard' });
    expect(res.status).toBe(400);
  });

  test('rejects a malformed warehouse id cleanly instead of crashing', async () => {
    const { token } = await makeSuperadmin();
    const target = await User.create({ name: 'T4', email: 't4@example.com', passwordHash: 'x' });
    const res = await request(app)
      .patch(`/api/users/${target._id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'warehouse_admin', warehouse: 'not-a-valid-object-id' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  test('deletes a user', async () => {
    const { token } = await makeSuperadmin();
    const target = await User.create({ name: 'Gone', email: 'gone@example.com', passwordHash: 'x' });
    const res = await request(app).delete(`/api/users/${target._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(await User.findById(target._id)).toBeNull();
  });

  test('404s for unknown id', async () => {
    const { token } = await makeSuperadmin();
    const fakeId = '64b000000000000000000000';
    const res = await request(app).delete(`/api/users/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
