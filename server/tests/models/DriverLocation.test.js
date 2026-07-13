require('../setup');
const DriverLocation = require('../../models/DriverLocation');
const User = require('../../models/User');

test('upserts one location doc per driver', async () => {
  const driver = await User.create({ name: 'Dri', email: 'dri@example.com', passwordHash: 'x', role: 'driver' });
  await DriverLocation.findOneAndUpdate(
    { driver: driver._id },
    { coords: { lat: 1, lng: 2 }, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  await DriverLocation.findOneAndUpdate(
    { driver: driver._id },
    { coords: { lat: 3, lng: 4 }, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  const count = await DriverLocation.countDocuments({ driver: driver._id });
  const doc = await DriverLocation.findOne({ driver: driver._id });
  expect(count).toBe(1);
  expect(doc.coords.lat).toBe(3);
});
