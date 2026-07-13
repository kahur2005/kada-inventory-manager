const mongoose = require('mongoose');

const boxItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const boxSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    qrToken: { type: String, required: true, unique: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    destinationStore: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    items: { type: [boxItemSchema], default: [] },
    status: {
      type: String,
      enum: ['PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'],
      default: 'PACKED',
    },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Box', boxSchema);
