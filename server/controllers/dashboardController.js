const Box = require("../models/Box");
const User = require("../models/User");
const Item = require("../models/Item");
const StoreStock = require("../models/StoreStock");
const Warehouse = require("../models/Warehouse");
const WarehouseStock = require("../models/WarehouseStock");
const HandoverLog = require("../models/HandoverLog");

const STATUSES = ["PACKED", "ASSIGNED", "IN_TRANSIT", "DELIVERED"];
const PERIODS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

function qtyFromLog(log) {
  if (log.action === "WAREHOUSE_STOCK_ADDED") {
    return log.meta?.qtyAdded || 0;
  }
  if (log.action === "BOX_PACKED" || log.action === "DELIVERED") {
    return Array.isArray(log.meta?.items)
      ? log.meta.items.reduce((sum, item) => sum + (item.qty || 0), 0)
      : 0;
  }
  return 0;
}

async function stats(req, res) {
  const now = new Date();
  const logWindowStart = new Date(now);
  logWindowStart.setDate(now.getDate() - PERIODS.monthly);

  const [boxesByStatusAgg, totalUsers, storeStockRows, warehouses, logs] =
    await Promise.all([
      Box.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      User.countDocuments(),
      StoreStock.find()
        .populate("item", "name sku unit")
        .populate("store", "name"),
      Warehouse.find(),
      HandoverLog.find({
        action: { $in: ["WAREHOUSE_STOCK_ADDED", "BOX_PACKED", "DELIVERED"] },
        timestamp: { $gte: logWindowStart },
      }).populate({
        path: "box",
        populate: { path: "destinationStore", select: "name" },
      }),
    ]);

  const boxesByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  boxesByStatusAgg.forEach((row) => {
    boxesByStatus[row._id] = row.count;
  });

  const lowStockAlerts = storeStockRows.filter(
    (row) => row.qty < row.threshold,
  ).length;

  let totalUsedM3 = 0;
  let totalCapacityM3 = 0;
  for (const wh of warehouses) {
    const rows = await WarehouseStock.find({ warehouse: wh._id }).populate(
      "item",
      "volumeM3",
    );
    totalUsedM3 += rows.reduce(
      (sum, row) => sum + (row.item?.volumeM3 || 0) * row.qty,
      0,
    );
    totalCapacityM3 += wh.capacityM3 || 0;
  }
  const warehouseUtilizationPct =
    totalCapacityM3 > 0 ? Math.round((totalUsedM3 / totalCapacityM3) * 100) : 0;

  // per-item aggregation maps
  const dailyMap = new Map();
  const weeklyMap = new Map();
  const monthlyMap = new Map();
  const collectItemId = (id) => (id ? id.toString() : null);
  const ensureEntry = (map, itemId) => {
    if (!map.has(itemId)) map.set(itemId, { itemId, inbound: 0, outbound: 0 });
    return map.get(itemId);
  };

  const turnover = {
    daily: { deliveredQty: 0 },
    weekly: { deliveredQty: 0 },
    monthly: { deliveredQty: 0 },
  };

  const deliveredByStoreItem = new Map();
  const periodStarts = {
    daily: new Date(now),
    weekly: new Date(now),
    monthly: new Date(now),
  };
  periodStarts.daily.setDate(now.getDate() - PERIODS.daily);
  periodStarts.weekly.setDate(now.getDate() - PERIODS.weekly);
  periodStarts.monthly.setDate(now.getDate() - PERIODS.monthly);

  const seenItemIds = new Set();

  for (const log of logs) {
    const logDate = new Date(log.timestamp);
    const qty = qtyFromLog(log);
    if (qty <= 0) continue;

    if (log.action === "WAREHOUSE_STOCK_ADDED") {
      const itemId = collectItemId(log.meta?.item);
      if (itemId) seenItemIds.add(itemId);
      if (logDate >= periodStarts.daily && itemId)
        ensureEntry(dailyMap, itemId).inbound += log.meta?.qtyAdded || 0;
      if (logDate >= periodStarts.weekly && itemId)
        ensureEntry(weeklyMap, itemId).inbound += log.meta?.qtyAdded || 0;
      if (logDate >= periodStarts.monthly && itemId)
        ensureEntry(monthlyMap, itemId).inbound += log.meta?.qtyAdded || 0;
    }

    if (log.action === "BOX_PACKED") {
      const items = Array.isArray(log.meta?.items) ? log.meta.items : [];
      for (const it of items) {
        const itemId = collectItemId(it.item);
        if (!itemId) continue;
        seenItemIds.add(itemId);
        const q = it.qty || 0;
        if (logDate >= periodStarts.daily)
          ensureEntry(dailyMap, itemId).outbound += q;
        if (logDate >= periodStarts.weekly)
          ensureEntry(weeklyMap, itemId).outbound += q;
        if (logDate >= periodStarts.monthly)
          ensureEntry(monthlyMap, itemId).outbound += q;
      }
    }

    if (log.action === "DELIVERED") {
      if (logDate >= periodStarts.daily) turnover.daily.deliveredQty += qty;
      if (logDate >= periodStarts.weekly) turnover.weekly.deliveredQty += qty;
      if (logDate >= periodStarts.monthly) turnover.monthly.deliveredQty += qty;

      const storeId = log.box?.destinationStore?._id?.toString();
      if (storeId) {
        for (const item of Array.isArray(log.meta?.items)
          ? log.meta.items
          : []) {
          const key = `${storeId}:${item.item?.toString() || ""}`;
          deliveredByStoreItem.set(
            key,
            (deliveredByStoreItem.get(key) || 0) + (item.qty || 0),
          );
          const itemId = collectItemId(item.item);
          if (itemId) seenItemIds.add(itemId);
        }
      }
    }
  }

  const totalStoreQty = storeStockRows.reduce((sum, row) => sum + row.qty, 0);
  const stockTurnover = {
    daily: {
      deliveredQty: turnover.daily.deliveredQty,
      totalQty: totalStoreQty,
      ratioPct:
        totalStoreQty > 0
          ? Math.round((turnover.daily.deliveredQty / totalStoreQty) * 100)
          : 0,
    },
    weekly: {
      deliveredQty: turnover.weekly.deliveredQty,
      totalQty: totalStoreQty,
      ratioPct:
        totalStoreQty > 0
          ? Math.round((turnover.weekly.deliveredQty / totalStoreQty) * 100)
          : 0,
    },
    monthly: {
      deliveredQty: turnover.monthly.deliveredQty,
      totalQty: totalStoreQty,
      ratioPct:
        totalStoreQty > 0
          ? Math.round((turnover.monthly.deliveredQty / totalStoreQty) * 100)
          : 0,
    },
  };

  // build warehouseFlow arrays limited to top N items
  const TOP_N = 20;
  const itemIds = Array.from(seenItemIds);
  const items =
    itemIds.length > 0
      ? await Item.find({ _id: { $in: itemIds } }).select("name sku category")
      : [];
  const itemById = new Map(items.map((it) => [it._id.toString(), it]));

  const mapToArray = (map) => {
    const arr = Array.from(map.values()).map((v) => ({
      item: itemById.get(v.itemId) || { _id: v.itemId, name: "", sku: "" },
      inbound: v.inbound || 0,
      outbound: v.outbound || 0,
    }));
    arr.sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));
    return arr.slice(0, TOP_N);
  };

  const warehouseFlow = {
    daily: mapToArray(dailyMap),
    weekly: mapToArray(weeklyMap),
    monthly: mapToArray(monthlyMap),
  };

  const slowMovingItems = storeStockRows
    .map((row) => {
      const key = `${row.store?._id?.toString() || ""}:${row.item?._id?.toString() || ""}`;
      const deliveredQty30d = deliveredByStoreItem.get(key) || 0;
      const status =
        row.qty === 0
          ? "Empty"
          : deliveredQty30d === 0
            ? "Dead stock"
            : deliveredQty30d <= Math.max(1, row.qty * 0.1)
              ? "Slow moving"
              : "Moving";
      return {
        item: row.item,
        store: row.store,
        qty: row.qty,
        deliveredQty30d,
        status,
      };
    })
    .sort((a, b) => {
      if (a.deliveredQty30d !== b.deliveredQty30d) {
        return a.deliveredQty30d - b.deliveredQty30d;
      }
      return b.qty - a.qty;
    })
    .slice(0, 6);

  res.json({
    boxesByStatus,
    totalUsers,
    lowStockAlerts,
    warehouseUtilizationPct,
    warehouseFlow,
    stockTurnover,
    slowMovingItems,
  });
}

module.exports = { stats };
