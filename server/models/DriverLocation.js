const mongoose = require('mongoose');

const STATUSES = ["idle", "on-route", "delivering", "offline"];

const driverLocationSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true },
  coords: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  heading: { type: Number, default: 0, min: 0, max: 359 },
  speedKph: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: STATUSES, default: "idle" },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

driverLocationSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('DriverLocation', driverLocationSchema);
