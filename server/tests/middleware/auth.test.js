require('../setup');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { authRequired, requireRole, signToken } = require('../../middleware/auth');

process.env.JWT_SECRET = 'test-secret';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

test('signToken produces a token that decodes to id and role', async () => {
  const user = await User.create({ name: 'A', email: 'a@example.com', passwordHash: 'x', role: 'driver' });
  const token = signToken(user);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  expect(decoded.id).toBe(user._id.toString());
  expect(decoded.role).toBe('driver');
});

test('authRequired rejects missing header', async () => {
  const req = { headers: {} };
  const res = mockRes();
  const next = jest.fn();
  await authRequired(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('authRequired rejects invalid token', async () => {
  const req = { headers: { authorization: 'Bearer garbage' } };
  const res = mockRes();
  const next = jest.fn();
  await authRequired(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
});

test('authRequired sets req.user and calls next for a valid token', async () => {
  const user = await User.create({ name: 'B', email: 'b@example.com', passwordHash: 'x', role: 'warehouse_admin' });
  const token = signToken(user);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  const next = jest.fn();
  await authRequired(req, res, next);
  expect(next).toHaveBeenCalled();
  expect(req.user.id).toBe(user._id.toString());
  expect(req.user.role).toBe('warehouse_admin');
  expect(req.user.passwordHash).toBeUndefined();
});

test('requireRole allows matching role and blocks others', () => {
  const next = jest.fn();
  const allow = requireRole('superadmin', 'warehouse_admin');

  const reqOk = { user: { role: 'warehouse_admin' } };
  allow(reqOk, mockRes(), next);
  expect(next).toHaveBeenCalledTimes(1);

  const resBlocked = mockRes();
  const reqBlocked = { user: { role: 'driver' } };
  allow(reqBlocked, resBlocked, jest.fn());
  expect(resBlocked.status).toHaveBeenCalledWith(403);
});
