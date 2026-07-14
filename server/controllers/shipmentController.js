const Shipment = require("../models/Shipment");
const StoreStock = require("../models/StoreStock");
const HandoverLog = require("../models/HandoverLog");

async function nextShipmentCode() {
  const count = await Shipment.countDocuments();
  return `SHP-${String(count + 1).padStart(4, "0")}`;
}

async function createShipment(req, res) {
  const { destinationStore, items } = req.body;

  if (!destinationStore || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "destinationStore and at least one item are required" });
  }

  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: "You are not linked to a warehouse" });
  }

  const code = await nextShipmentCode();
  const shipment = await Shipment.create({
    code,
    warehouse: warehouseId,
    destinationStore,
    items,
  });

  await HandoverLog.create({
    actor: req.user.id,
    action: "BOX_PACKED",
    meta: { code, shipmentId: shipment._id.toString(), destinationStore, items },
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

  if (req.user.role === "warehouse_admin") {
    filter.warehouse = req.user.warehouse;
  } else if (req.user.role === "store_admin") {
    filter.destinationStore = req.user.store;
  }

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

  if (shipment.destinationStore._id.toString() !== req.user.store) {
    return res.status(403).json({ message: "This shipment is not destined for your store" });
  }

  for (const line of shipment.items) {
    await StoreStock.findOneAndUpdate(
      { store: req.user.store, item: line.item._id },
      { $inc: { qty: line.qty }, $setOnInsert: { threshold: 0 } },
      { upsert: true }
    );
  }

  shipment.status = "RECEIVED";
  await shipment.save();

  const items = shipment.items.map((line) => ({ name: line.item.name, qty: line.qty }));

  await HandoverLog.create({
    actor: req.user.id,
    action: "DELIVERED",
    meta: { shipmentId: shipment._id.toString(), code: shipment.code, items },
  });

  res.json({ message: "Shipment received", items, shipment });
}

module.exports = { createShipment, listShipments, getShipment, scanShipment };
