const express = require("express");
const Warehouse = require("../models/Warehouse");
const Store = require("../models/Store");
const DriverLocation = require("../models/DriverLocation");
const { authRequired, requireRole } = require("../middleware/auth");

const router = express.Router();
const VALID_STATUSES = DriverLocation.STATUSES;

router.use(authRequired);

router.get("/locations", requireRole("superadmin", "warehouse_admin"), async (req, res) => {
  try {
    const [warehouses, stores, drivers] = await Promise.all([
      Warehouse.find().lean(),
      Store.find().lean(),
      DriverLocation.find().populate("driver", "name").lean(),
    ]);

    res.json({
      warehouses: warehouses.map(toWarehouseDTO),
      stores: stores.map(toStoreDTO),
      drivers: drivers.map(toDriverDTO),
    });
  } catch (err) {
    console.error("Gagal memuat data lokasi:", err);
    res.status(500).json({ error: "Gagal memuat data lokasi." });
  }
});

router.post("/drivers/:driverId", requireRole("superadmin", "warehouse_admin", "driver"), express.json(), async (req, res) => {
  const { driverId } = req.params;
  const { name, lat, lng, heading, speedKph } = req.body || {};

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ error: "Field 'lat' dan 'lng' wajib berupa angka." });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "Koordinat di luar jangkauan yang valid." });
  }

  try {
    const update = {
      coords: { lat, lng },
      updatedAt: new Date(),
    };
    if (typeof heading === "number") update.heading = ((heading % 360) + 360) % 360;
    if (typeof speedKph === "number") update.speedKph = Math.max(0, speedKph);

    const driver = await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      {
        $set: update,
        $setOnInsert: {
          driver: driverId,
          name: name || `Sopir ${driverId}`,
          status: "idle",
        },
      },
      { new: true, upsert: true }
    ).lean();

    res.json({ ok: true, driver: toDriverDTO(driver) });
  } catch (err) {
    console.error("Gagal update lokasi sopir:", err);
    res.status(500).json({ error: "Gagal menyimpan lokasi sopir." });
  }
});

router.post("/drivers/:driverId/status", requireRole("superadmin", "warehouse_admin", "driver"), express.json(), async (req, res) => {
  const { driverId } = req.params;
  const { status } = req.body || {};

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status tidak valid. Gunakan salah satu: ${VALID_STATUSES.join(", ")}` });
  }

  try {
    const driver = await DriverLocation.findOneAndUpdate(
      { driver: driverId },
      { $set: { status, updatedAt: new Date() } },
      { new: true }
    ).lean();

    if (!driver) {
      return res.status(404).json({ error: "Sopir tidak ditemukan." });
    }

    res.json({ ok: true, driver: toDriverDTO(driver) });
  } catch (err) {
    console.error("Gagal update status sopir:", err);
    res.status(500).json({ error: "Gagal menyimpan status sopir." });
  }
});

function toWarehouseDTO(doc) {
  return { id: doc._id.toString(), name: doc.name, lat: doc.coords?.lat, lng: doc.coords?.lng, address: doc.address };
}

function toStoreDTO(doc) {
  return { id: doc._id.toString(), name: doc.name, lat: doc.coords?.lat, lng: doc.coords?.lng, address: doc.address };
}

function toDriverDTO(doc) {
  return {
    id: doc.driver?._id?.toString() || doc.driver?.toString(),
    name: doc.name,
    lat: doc.coords?.lat,
    lng: doc.coords?.lng,
    heading: doc.heading,
    speedKph: doc.speedKph,
    status: doc.status,
    lastUpdated: doc.updatedAt,
  };
}

module.exports = router;
