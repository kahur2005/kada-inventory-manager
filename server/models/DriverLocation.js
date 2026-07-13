const mongoose = require('mongoose');

const driverLocationSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  coords: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DriverLocation', driverLocationSchema);
