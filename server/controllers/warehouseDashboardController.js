const Box = require('../models/Box');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const Store = require('../models/Store');
const WarehouseStock = require('../models/WarehouseStock');
const StoreStock = require('../models/StoreStock');
const StockHistory = require('../models/StockHistory');
const HandoverLog = require('../models/HandoverLog');

const AVG_SPEED_KPH = 30;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function driverPerformance(req, res) {
  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: 'Warehouse admin must be linked to a warehouse' });
  }

  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) {
    return res.status(404).json({ message: 'Warehouse not found' });
  }

  const storeIds = warehouse.stores || [];
  const stores = await Store.find({ _id: { $in: storeIds } }).lean();
  const storeMap = Object.fromEntries(stores.map((s) => [s._id.toString(), s]));

  const deliveredBoxes = await Box.find({
    warehouse: warehouseId,
    status: 'DELIVERED',
    assignedDriver: { $ne: null },
  })
    .populate('assignedDriver', 'name')
    .populate('destinationStore', 'name')
    .lean();

  const driverLogs = await HandoverLog.find({
    box: { $in: deliveredBoxes.map((b) => b._id) },
    action: { $in: ['DRIVER_ASSIGNED', 'DELIVERED'] },
  }).lean();

  const logsByBox = {};
  for (const log of driverLogs) {
    const boxId = log.box.toString();
    if (!logsByBox[boxId]) logsByBox[boxId] = {};
    logsByBox[boxId][log.action] = log.timestamp;
  }

  const driverMap = {};
  for (const box of deliveredBoxes) {
    const driver = box.assignedDriver;
    if (!driver) continue;
    const driverId = driver._id.toString();
    const boxId = box._id.toString();
    const logs = logsByBox[boxId] || {};
    const assignedAt = logs.DRIVER_ASSIGNED;
    const deliveredAt = logs.DELIVERED || box.updatedAt;

    let actualMinutes = null;
    if (assignedAt && deliveredAt) {
      actualMinutes = Math.round((new Date(deliveredAt) - new Date(assignedAt)) / 60000);
    }

    const store = storeMap[box.destinationStore?._id?.toString()];
    let estimatedMinutes = null;
    let distanceKm = null;
    if (store?.coords?.lat && store?.coords?.lng && warehouse.coords?.lat && warehouse.coords?.lng) {
      distanceKm = haversineKm(warehouse.coords.lat, warehouse.coords.lng, store.coords.lat, store.coords.lng);
      estimatedMinutes = Math.round((distanceKm / AVG_SPEED_KPH) * 60);
    }

    if (!driverMap[driverId]) {
      driverMap[driverId] = {
        driverId,
        driverName: driver.name,
        deliveries: 0,
        totalActualMinutes: 0,
        totalEstimatedMinutes: 0,
        actualCount: 0,
        estimatedCount: 0,
        storeBreakdown: [],
      };
    }

    const entry = driverMap[driverId];
    entry.deliveries++;
    if (actualMinutes !== null) {
      entry.totalActualMinutes += actualMinutes;
      entry.actualCount++;
    }
    if (estimatedMinutes !== null) {
      entry.totalEstimatedMinutes += estimatedMinutes;
      entry.estimatedCount++;
    }
    entry.storeBreakdown.push({
      storeName: box.destinationStore?.name || 'Unknown',
      actualMin: actualMinutes,
      estimatedMin: estimatedMinutes,
      distanceKm: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
    });
  }

  const drivers = Object.values(driverMap).map((d) => ({
    driverId: d.driverId,
    driverName: d.driverName,
    deliveries: d.deliveries,
    avgActualMinutes: d.actualCount > 0 ? Math.round(d.totalActualMinutes / d.actualCount) : null,
    avgEstimatedMinutes: d.estimatedCount > 0 ? Math.round(d.totalEstimatedMinutes / d.estimatedCount) : null,
    efficiency:
      d.actualCount > 0 && d.estimatedCount > 0
        ? Math.round((d.totalEstimatedMinutes / d.actualCount / (d.totalEstimatedMinutes / d.estimatedCount)) * 100)
        : null,
    storeBreakdown: d.storeBreakdown,
  }));

  const storeProximity = stores
    .filter((s) => s.coords?.lat && s.coords?.lng && warehouse.coords?.lat && warehouse.coords?.lng)
    .map((s) => {
      const dist = haversineKm(warehouse.coords.lat, warehouse.coords.lng, s.coords.lat, s.coords.lng);
      const estMin = Math.round((dist / AVG_SPEED_KPH) * 60);
      const boxCount = deliveredBoxes.filter((b) => b.destinationStore?.toString() === s._id.toString()).length;
      return { storeId: s._id, storeName: s.name, distanceKm: Math.round(dist * 10) / 10, estimatedMinutes: estMin, deliveries: boxCount };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const totalDelivered = deliveredBoxes.length;
  const allActual = drivers.filter((d) => d.avgActualMinutes !== null);
  const overallAvgActual = allActual.length > 0 ? Math.round(allActual.reduce((s, d) => s + d.avgActualMinutes, 0) / allActual.length) : null;
  const allEst = drivers.filter((d) => d.avgEstimatedMinutes !== null);
  const overallAvgEstimated = allEst.length > 0 ? Math.round(allEst.reduce((s, d) => s + d.avgEstimatedMinutes, 0) / allEst.length) : null;

  res.json({
    totalDelivered,
    overallAvgActualMinutes: overallAvgActual,
    overallAvgEstimatedMinutes: overallAvgEstimated,
    drivers,
    storeProximity,
  });
}

async function stockAvailability(req, res) {
  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: 'Warehouse admin must be linked to a warehouse' });
  }

  const days = parseInt(req.query.days, 10) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const warehouse = await Warehouse.findById(warehouseId).lean();
  const storeIds = warehouse?.stores || [];

  const [warehouseStockRows, storeStockRows, whHistory, storeHistory] = await Promise.all([
    WarehouseStock.find({ warehouse: warehouseId }).populate('item', 'name sku unit').lean(),
    StoreStock.find({ store: { $in: storeIds } })
      .populate('item', 'name sku unit')
      .populate('store', 'name')
      .lean(),
    StockHistory.find({ stockType: 'warehouse', warehouse: warehouseId, timestamp: { $gte: since } })
      .populate('item', 'name sku')
      .sort({ timestamp: 1 })
      .lean(),
    StockHistory.find({ stockType: 'store', store: { $in: storeIds }, timestamp: { $gte: since } })
      .populate('item', 'name sku')
      .populate('store', 'name')
      .sort({ timestamp: 1 })
      .lean(),
  ]);

  const warehouseStock = warehouseStockRows.map((row) => ({
    itemId: row.item?._id,
    itemName: row.item?.name,
    itemSku: row.item?.sku,
    unit: row.item?.unit,
    currentQty: row.qty,
    maxLevel: null,
    threshold: null,
  }));

  const storeStock = storeStockRows.map((row) => ({
    storeId: row.store?._id,
    storeName: row.store?.name,
    itemId: row.item?._id,
    itemName: row.item?.name,
    itemSku: row.item?.sku,
    unit: row.item?.unit,
    currentQty: row.qty,
    maxLevel: row.maxLevel || 0,
    threshold: row.threshold || 0,
    belowThreshold: row.qty < row.threshold,
  }));

  const groupHistory = (rows, keyFn) => {
    const grouped = {};
    for (const row of rows) {
      const key = keyFn(row);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ date: row.timestamp, qty: row.qty });
    }
    return grouped;
  };

  const warehouseHistoryGrouped = groupHistory(whHistory, (r) => r.item?._id?.toString() || 'unknown');
  const storeHistoryGrouped = groupHistory(storeHistory, (r) => `${r.store?._id}:${r.item?._id}`);

  const reorderAlerts = storeStock
    .filter((s) => s.belowThreshold)
    .map((s) => {
      const key = `${s.storeId}:${s.itemId}`;
      const history = storeHistoryGrouped[key] || [];
      let estimatedDaysUntilEmpty = null;
      if (history.length >= 2) {
        const first = history[0];
        const last = history[history.length - 1];
        const elapsedDays = (new Date(last.date) - new Date(first.date)) / 86400000;
        if (elapsedDays > 0) {
          const depletionRate = (first.qty - last.qty) / elapsedDays;
          if (depletionRate > 0) {
            estimatedDaysUntilEmpty = Math.round((last.qty / depletionRate) * 10) / 10;
          }
        }
      }
      return { ...s, estimatedDaysUntilEmpty };
    });

  res.json({
    warehouseStock,
    storeStock,
    warehouseHistory: warehouseHistoryGrouped,
    storeHistory: storeHistoryGrouped,
    reorderAlerts,
  });
}

module.exports = { driverPerformance, stockAvailability };
