const express = require("express");
const QRCode = require("qrcode");
const Shipment = require("../models/Shipment");

const router = express.Router();

// Generate QR dari shipment code
router.get("/shipment/:id", async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: "Shipment tidak ditemukan" });
    }

    const qrData = JSON.stringify({ type: "shipment", code: shipment.code });
    const dataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    res.json({ qrDataUrl: dataUrl, code: shipment.code });
  } catch (err) {
    console.error("Gagal generate QR code:", err);
    res.status(500).json({ error: "Gagal membuat QR code." });
  }
});

// Download QR shipment sebagai file
router.get("/shipment/:id/download", async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) {
      return res.status(404).json({ error: "Shipment tidak ditemukan" });
    }

    const qrData = JSON.stringify({ type: "shipment", code: shipment.code });
    const buffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 400,
      margin: 2,
      errorCorrectionLevel: "M",
    });

    res.set("Content-Type", "image/png");
    res.set("Content-Disposition", `attachment; filename="${shipment.code}.png"`);
    res.send(buffer);
  } catch (err) {
    console.error("Gagal generate QR code:", err);
    res.status(500).json({ error: "Gagal membuat QR code." });
  }
});

module.exports = router;
