require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const { signToken } = require('../../middleware/auth');

describe('Store CRUD', () => {
  test('superadmin sees all stores', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await Store.create({ name: 'Store 1', address: 'A' });
    await Store.create({ name: 'Store 2', address: 'B' });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(2);
  });

  test('store_admin only sees their own store', async () => {
    const store1 = await Store.create({ name: 'Store 1', address: 'A' });
    await Store.create({ name: 'Store 2', address: 'B' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store1._id });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0].name).toBe('Store 1');
  });

  test('driver cannot list stores', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });

  test('superadmin creates a store with coords set by map click', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ name: 'Store 3', address: 'C', coords: { lat: -6.2, lng: 106.8 } });
    expect(res.status).toBe(201);
    expect(res.body.store.coords.lat).toBe(-6.2);
  });

  test('rejects malformed id on update (returns 404, not crash)', async () => {
    const token = signToken(await User.create({ name: 'S3', email: 's3@example.com', passwordHash: 'x', role: 'superadmin' }));
    const res = await request(app)
      .patch(`/api/stores/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('rejects malformed id on delete (returns 404, not crash)', async () => {
    const token = signToken(await User.create({ name: 'S4', email: 's4@example.com', passwordHash: 'x', role: 'superadmin' }));
    const res = await request(app)
      .delete(`/api/stores/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
