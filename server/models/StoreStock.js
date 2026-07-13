const mongoose = require('mongoose');

const storeStockSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, default: 0, min: 0 },
    threshold: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

storeStockSchema.index({ store: 1, item: 1 }, { unique: true });

module.exports = mongoose.model('StoreStock', storeStockSchema);
