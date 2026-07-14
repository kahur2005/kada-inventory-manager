const express = require("express");
const router = express.Router();
const { authRequired, requireRole } = require("../middleware/auth");
const { createShipment, listShipments, getShipment, scanShipment } = require("../controllers/shipmentController");

router.use(authRequired);

router.post("/", requireRole("superadmin", "warehouse_admin"), createShipment);
router.get("/", listShipments);
router.get("/:id", getShipment);
router.post("/scan", requireRole("superadmin", "warehouse_admin"), scanShipment);

module.exports = router;
