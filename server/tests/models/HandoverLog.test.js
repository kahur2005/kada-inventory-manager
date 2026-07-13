require('../setup');
const HandoverLog = require('../../models/HandoverLog');
const User = require('../../models/User');

test('creates a handover log entry', async () => {
  const actor = await User.create({ name: 'Admin', email: 'admin@example.com', passwordHash: 'x', role: 'warehouse_admin' });
  const log = await HandoverLog.create({
    actor: actor._id,
    action: 'BOX_PACKED',
    coords: { lat: -6.2, lng: 106.8 },
    meta: { boxCode: 'BX-0001' },
  });
  expect(log.action).toBe('BOX_PACKED');
  expect(log.meta.boxCode).toBe('BX-0001');
});

test('rejects invalid action', async () => {
  const actor = await User.create({ name: 'Admin', email: 'admin2@example.com', passwordHash: 'x' });
  await expect(HandoverLog.create({ actor: actor._id, action: 'TELEPORTED' })).rejects.toThrow();
});
