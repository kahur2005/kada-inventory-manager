require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');

describe('POST /api/auth/register', () => {
  test('creates an unassigned user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@example.com', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('unassigned');
    expect(res.body.user.email).toBe('ana@example.com');
  });

  test('rejects duplicate email', async () => {
    await request(app).post('/api/auth/register').send({ name: 'A', email: 'dup@example.com', password: 'x' });
    const res = await request(app).post('/api/auth/register').send({ name: 'B', email: 'dup@example.com', password: 'y' });
    expect(res.status).toBe(400);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'x@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Bo', email: 'bo@example.com', password: 'correcthorse' });
    const res = await request(app).post('/api/auth/login').send({ email: 'bo@example.com', password: 'correcthorse' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('bo@example.com');
  });

  test('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Cy', email: 'cy@example.com', password: 'rightpass' });
    const res = await request(app).post('/api/auth/login').send({ email: 'cy@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('rejects unknown email', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope@example.com', password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user for a valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Dee', email: 'dee@example.com', password: 'password1' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('dee@example.com');
  });

  test('rejects missing token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('reflects a role change made directly in the DB (refresh picks up new role)', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'password1' });
    await User.findOneAndUpdate({ email: 'eve@example.com' }, { role: 'driver' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.body.user.role).toBe('driver');
  });
});
