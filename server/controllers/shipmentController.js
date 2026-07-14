const Shipment = require("../models/Shipment");
const Warehouse = require("../models/Warehouse");

async function nextShipmentCode() {
  const count = await Shipment.countDocuments();
  return `SHP-${String(count + 1).padStart(4, "0")}`;
}

async function createShipment(req, res) {
  const { destinationStore, items } = req.body;

  if (!destinationStore || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "destinationStore and at least one item are required" });
  }

  // Cari warehouse yang terkait dengan user yang login
  // Untuk sekarang pakai query param atau default
  const warehouseId = req.body.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: "warehouse is required" });
  }

  const code = await nextShipmentCode();
  const shipment = await Shipment.create({
    code,
    warehouse: warehouseId,
    destinationStore,
    items,
  });

  const populated = await shipment.populate([
    { path: "warehouse", select: "name address" },
    { path: "destinationStore", select: "name address" },
    { path: "items.item", select: "name sku unit" },
  ]);

  res.status(201).json({ shipment: populated });
}

async function listShipments(req, res) {
  const filter = {};
  if (req.query.warehouse) filter.warehouse = req.query.warehouse;
  if (req.query.status) filter.status = req.query.status;

  const shipments = await Shipment.find(filter)
    .populate("warehouse", "name address")
    .populate("destinationStore", "name address")
    .populate("items.item", "name sku unit")
    .sort({ createdAt: -1 });

  res.json({ shipments });
}

async function getShipment(req, res) {
  const shipment = await Shipment.findById(req.params.id)
    .populate("warehouse", "name address")
    .populate("destinationStore", "name address")
    .populate("items.item", "name sku unit");

  if (!shipment) {
    return res.status(404).json({ message: "Shipment not found" });
  }
  res.json({ shipment });
}

async function scanShipment(req, res) {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "code is required" });
  }

  const shipment = await Shipment.findOne({ code })
    .populate("warehouse", "name address")
    .populate("destinationStore", "name address")
    .populate("items.item", "name sku unit");

  if (!shipment) {
    return res.status(404).json({ message: "Shipment not found" });
  }

  if (shipment.status === "RECEIVED") {
    return res.status(400).json({ message: "Shipment already received" });
  }

  shipment.status = "RECEIVED";
  await shipment.save();

  res.json({ message: "Shipment received", shipment });
}

module.exports = { createShipment, listShipments, getShipment, scanShipment };
