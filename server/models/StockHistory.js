const mongoose = require('mongoose');

const stockHistorySchema = new mongoose.Schema(
  {
    stockType: { type: String, enum: ['warehouse', 'store'], required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, required: true },
    changeDelta: { type: Number, default: 0 },
    reason: {
      type: String,
      enum: ['INITIAL', 'RESTOCK', 'DELIVERY', 'ADJUSTMENT', 'ASSIGNMENT', 'RECEIVED'],
      default: 'ADJUSTMENT',
    },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

stockHistorySchema.index({ warehouse: 1, item: 1, timestamp: -1 });
stockHistorySchema.index({ store: 1, item: 1, timestamp: -1 });

module.exports = mongoose.model('StockHistory', stockHistorySchema);
