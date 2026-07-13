require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const { signToken } = require('../../middleware/auth');

async function tokenFor(role) {
  const user = await User.create({ name: role, email: `${role}@example.com`, passwordHash: 'x', role });
  return signToken(user);
}

describe('Item catalog', () => {
  test('any authenticated role can list items', async () => {
    const token = await tokenFor('driver');
    const res = await request(app).get('/api/items').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('superadmin can create, update, and delete an item', async () => {
    const token = await tokenFor('superadmin');
    const create = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Indomie Goreng', sku: 'sku-001', unit: 'pcs' });
    expect(create.status).toBe(201);
    expect(create.body.item.sku).toBe('SKU-001');

    const id = create.body.item._id;
    const update = await request(app)
      .patch(`/api/items/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Indomie Goreng Rendang' });
    expect(update.status).toBe(200);
    expect(update.body.item.name).toBe('Indomie Goreng Rendang');

    const del = await request(app).delete(`/api/items/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  test('non-superadmin cannot create an item', async () => {
    const token = await tokenFor('warehouse_admin');
    const res = await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'X', sku: 'X1' });
    expect(res.status).toBe(403);
  });

  test('rejects duplicate sku on create', async () => {
    const token = await tokenFor('superadmin');
    await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'A', sku: 'DUP' });
    const res = await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'B', sku: 'DUP' });
    expect(res.status).toBe(400);
  });

  test('rejects malformed id on update (returns 404, not crash)', async () => {
    const token = await tokenFor('superadmin');
    const res = await request(app)
      .patch(`/api/items/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('rejects malformed id on delete (returns 404, not crash)', async () => {
    const token = await tokenFor('superadmin');
    const res = await request(app)
      .delete(`/api/items/not-a-valid-id`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
