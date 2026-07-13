const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    coords: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    capacityM3: { type: Number, default: 0 },
    areaM2: { type: Number, default: 0 },
    stores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Warehouse', warehouseSchema);
