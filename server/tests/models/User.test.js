require('../setup');
const User = require('../../models/User');

test('creates a user with default role unassigned', async () => {
  const user = await User.create({ name: 'Ana', email: 'ana@example.com', passwordHash: 'hashed' });
  expect(user.role).toBe('unassigned');
  expect(user.warehouse).toBeNull();
  expect(user.store).toBeNull();
});

test('rejects duplicate email', async () => {
  await User.create({ name: 'Ana', email: 'dup@example.com', passwordHash: 'x' });
  await expect(
    User.create({ name: 'Bo', email: 'dup@example.com', passwordHash: 'y' })
  ).rejects.toThrow();
});

test('rejects invalid role', async () => {
  await expect(
    User.create({ name: 'Cy', email: 'cy@example.com', passwordHash: 'x', role: 'wizard' })
  ).rejects.toThrow();
});
