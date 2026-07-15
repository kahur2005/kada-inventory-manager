const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    unit: { type: String, enum: ["pcs", "box", "kg"], default: "pcs" },
    volumeM3: { type: Number, default: null },
    category: { type: String, trim: true, default: "Other" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Item", itemSchema);
