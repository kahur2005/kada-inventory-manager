const mongoose = require('mongoose');

const handoverLogSchema = new mongoose.Schema({
  box: { type: mongoose.Schema.Types.ObjectId, ref: 'Box', default: null },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: [
      'BOX_PACKED',
      'DRIVER_ASSIGNED',
      'PICKED_UP',
      'DELIVERED',
      'STOCK_ADJUSTED',
      'WAREHOUSE_STOCK_ADDED',
    ],
    required: true,
  },
  coords: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('HandoverLog', handoverLogSchema);
