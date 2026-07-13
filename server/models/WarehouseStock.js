const mongoose = require('mongoose');

const warehouseStockSchema = new mongoose.Schema(
  {
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

warehouseStockSchema.index({ warehouse: 1, item: 1 }, { unique: true });

module.exports = mongoose.model('WarehouseStock', warehouseStockSchema);
