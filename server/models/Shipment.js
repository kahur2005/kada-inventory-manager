const mongoose = require("mongoose");

const shipmentItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const shipmentSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    destinationStore: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    items: { type: [shipmentItemSchema], required: true, min: 1 },
    status: {
      type: String,
      enum: ["CREATED", "SCANNED", "RECEIVED"],
      default: "CREATED",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shipment", shipmentSchema);
