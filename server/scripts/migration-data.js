const fs = require('fs/promises');
const path = require('path');

const COLLECTIONS = [
  'users',
  'warehouses',
  'stores',
  'items',
  'warehouseStocks',
  'storeStocks',
  'boxes',
  'handoverLogs',
  'stockHistories',
  'driverLocations',
];

const ROLE_NAMES = new Set(['superadmin', 'warehouse_admin', 'store_admin', 'driver', 'unassigned']);
const BOX_STATUSES = new Set(['PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED']);
const DRIVER_STATUSES = new Set(['idle', 'on-route', 'delivering', 'offline']);
const STOCK_REASONS = new Set(['INITIAL', 'RESTOCK', 'TRANSFER_OUT', 'TRANSFER_IN', 'DELIVERY', 'ADJUSTMENT', 'RETURN', 'ASSIGNMENT', 'RECEIVED']);

function idOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value._id !== undefined) return idOf(value._id);
  if (typeof value.toString === 'function') return value.toString();
  return String(value);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function integerIfDiscrete(value, unit) {
  return unit === 'kg' || (finiteNumber(value) && Number.isInteger(value));
}

function addUnique(seen, value, pathName, errors) {
  if (seen.has(value)) errors.push(`${pathName}: duplicate value ${value}`);
  seen.add(value);
}

function validateCoords(value, pathName, errors) {
  if (value === null || value === undefined) return;
  if (!value || typeof value !== 'object') {
    errors.push(`${pathName}: expected an object`);
    return;
  }
  const lat = value.lat;
  const lng = value.lng;
  if (lat !== null && lat !== undefined && (!finiteNumber(lat) || lat < -90 || lat > 90)) errors.push(`${pathName}.lat: invalid latitude`);
  if (lng !== null && lng !== undefined && (!finiteNumber(lng) || lng < -180 || lng > 180)) errors.push(`${pathName}.lng: invalid longitude`);
}

function validateDate(value, pathName, errors) {
  if (value === null || value === undefined) return;
  if (Number.isNaN(new Date(value).getTime())) errors.push(`${pathName}: invalid date`);
}

function validateQuantity(value, pathName, unit, errors, { allowZero = true } = {}) {
  if (!finiteNumber(value) || (allowZero ? value < 0 : value <= 0)) {
    errors.push(`${pathName}: must be ${allowZero ? 'a non-negative' : 'a positive'} number`);
    return;
  }
  if (!integerIfDiscrete(value, unit)) errors.push(`${pathName}: ${unit} quantities must be integers`);
}

function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object') return ['snapshot: expected an object'];
  for (const collection of COLLECTIONS) {
    if (!Array.isArray(snapshot[collection])) errors.push(`${collection}: expected an array`);
  }
  if (errors.length) return errors;

  const byId = Object.fromEntries(COLLECTIONS.map((name) => [name, new Map()]));
  for (const collection of COLLECTIONS) {
    for (const [index, row] of snapshot[collection].entries()) {
      const id = idOf(row && row._id);
      if (!id) errors.push(`${collection}[${index}]._id: required`);
      else if (byId[collection].has(id)) errors.push(`${collection}[${index}]._id: duplicate value ${id}`);
      else byId[collection].set(id, row);
    }
  }

  const warehousesByStore = new Map();
  const itemSkus = new Set();
  const userEmails = new Set();
  const boxCodes = new Set();
  const qrTokens = new Set();
  const warehouseStockKeys = new Set();
  const storeStockKeys = new Set();
  const locationDrivers = new Set();

  snapshot.warehouses.forEach((row, index) => {
    validateCoords(row.coords, `warehouses[${index}].coords`, errors);
    if (finiteNumber(row.capacityM3) && row.capacityM3 < 0) errors.push(`warehouses[${index}].capacityM3: must be non-negative`);
    if (finiteNumber(row.areaM2) && row.areaM2 < 0) errors.push(`warehouses[${index}].areaM2: must be non-negative`);
    for (const storeId of row.stores || []) {
      const id = idOf(storeId);
      if (!byId.stores.has(id)) errors.push(`warehouses[${index}].stores: dangling store ${id}`);
      else if (warehousesByStore.has(id)) errors.push(`stores.${id}: assigned to multiple warehouses`);
      else warehousesByStore.set(id, idOf(row._id));
    }
    validateDate(row.createdAt, `warehouses[${index}].createdAt`, errors);
    validateDate(row.updatedAt, `warehouses[${index}].updatedAt`, errors);
  });

  snapshot.stores.forEach((row, index) => {
    if (!warehousesByStore.has(idOf(row._id))) errors.push(`stores[${index}]: not assigned to a warehouse`);
    validateCoords(row.coords, `stores[${index}].coords`, errors);
    validateDate(row.createdAt, `stores[${index}].createdAt`, errors);
    validateDate(row.updatedAt, `stores[${index}].updatedAt`, errors);
  });

  snapshot.items.forEach((row, index) => {
    addUnique(itemSkus, String(row.sku || '').trim().toUpperCase(), `items[${index}].sku`, errors);
    if (!['pcs', 'box', 'kg'].includes(row.unit)) errors.push(`items[${index}].unit: invalid unit ${row.unit}`);
    if (!finiteNumber(row.volumeM3) || row.volumeM3 < 0) errors.push(`items[${index}].volumeM3: must be non-negative`);
  });

  snapshot.users.forEach((row, index) => {
    addUnique(userEmails, String(row.email || '').trim().toLowerCase(), `users[${index}].email`, errors);
    if (!ROLE_NAMES.has(row.role)) errors.push(`users[${index}].role: invalid role ${row.role}`);
    if (row.warehouse && !byId.warehouses.has(idOf(row.warehouse))) errors.push(`users[${index}].warehouse: dangling warehouse`);
    if (row.store && !byId.stores.has(idOf(row.store))) errors.push(`users[${index}].store: dangling store`);
    if (row.role === 'warehouse_admin' && (!row.warehouse || row.store)) errors.push(`users[${index}]: warehouse_admin must have only a warehouse scope`);
    if (row.role === 'store_admin' && (!row.store || row.warehouse)) errors.push(`users[${index}]: store_admin must have only a store scope`);
    if (['superadmin', 'driver', 'unassigned'].includes(row.role) && (row.warehouse || row.store)) errors.push(`users[${index}]: ${row.role} cannot have a location scope`);
  });

  snapshot.warehouseStocks.forEach((row, index) => {
    const warehouse = idOf(row.warehouse);
    const item = idOf(row.item);
    if (!byId.warehouses.has(warehouse)) errors.push(`warehouseStocks[${index}].warehouse: dangling reference`);
    const itemDoc = byId.items.get(item);
    if (!itemDoc) errors.push(`warehouseStocks[${index}].item: dangling reference`);
    validateQuantity(row.qty ?? 0, `warehouseStocks[${index}].qty`, itemDoc && itemDoc.unit, errors);
    addUnique(warehouseStockKeys, `${warehouse}:${item}`, `warehouseStocks[${index}]`, errors);
  });

  snapshot.storeStocks.forEach((row, index) => {
    const store = idOf(row.store);
    const item = idOf(row.item);
    if (!byId.stores.has(store)) errors.push(`storeStocks[${index}].store: dangling reference`);
    const itemDoc = byId.items.get(item);
    if (!itemDoc) errors.push(`storeStocks[${index}].item: dangling reference`);
    validateQuantity(row.qty ?? 0, `storeStocks[${index}].qty`, itemDoc && itemDoc.unit, errors);
    validateQuantity(row.threshold ?? 0, `storeStocks[${index}].threshold`, itemDoc && itemDoc.unit, errors);
    validateQuantity(row.maxLevel ?? 0, `storeStocks[${index}].maxLevel`, itemDoc && itemDoc.unit, errors);
    if (finiteNumber(row.threshold) && finiteNumber(row.maxLevel) && row.maxLevel < row.threshold) errors.push(`storeStocks[${index}]: maxLevel must be >= threshold`);
    addUnique(storeStockKeys, `${store}:${item}`, `storeStocks[${index}]`, errors);
  });

  snapshot.boxes.forEach((row, index) => {
    addUnique(boxCodes, String(row.code || '').trim(), `boxes[${index}].code`, errors);
    addUnique(qrTokens, String(row.qrToken || '').trim(), `boxes[${index}].qrToken`, errors);
    if (!byId.warehouses.has(idOf(row.warehouse))) errors.push(`boxes[${index}].warehouse: dangling reference`);
    if (!byId.stores.has(idOf(row.destinationStore))) errors.push(`boxes[${index}].destinationStore: dangling reference`);
    if (row.assignedDriver && !byId.users.has(idOf(row.assignedDriver))) errors.push(`boxes[${index}].assignedDriver: dangling reference`);
    if (!BOX_STATUSES.has(row.status)) errors.push(`boxes[${index}].status: invalid status ${row.status}`);
    validateDate(row.expectedArrival, `boxes[${index}].expectedArrival`, errors);
    const itemKeys = new Set();
    for (const [lineIndex, line] of (row.items || []).entries()) {
      const itemId = idOf(line.item);
      const itemDoc = byId.items.get(itemId);
      if (!itemDoc) errors.push(`boxes[${index}].items[${lineIndex}].item: dangling reference`);
      validateQuantity(line.qty, `boxes[${index}].items[${lineIndex}].qty`, itemDoc && itemDoc.unit, errors, { allowZero: false });
      addUnique(itemKeys, itemId, `boxes[${index}].items[${lineIndex}].item`, errors);
    }
  });

  snapshot.handoverLogs.forEach((row, index) => {
    if (row.box && !byId.boxes.has(idOf(row.box))) errors.push(`handoverLogs[${index}].box: dangling reference`);
    if (!byId.users.has(idOf(row.actor))) errors.push(`handoverLogs[${index}].actor: dangling reference`);
    if (!['BOX_PACKED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'STOCK_ADJUSTED', 'WAREHOUSE_STOCK_ADDED'].includes(row.action)) errors.push(`handoverLogs[${index}].action: invalid action`);
    validateCoords(row.coords, `handoverLogs[${index}].coords`, errors);
    validateDate(row.timestamp, `handoverLogs[${index}].timestamp`, errors);
  });

  snapshot.stockHistories.forEach((row, index) => {
    const item = byId.items.get(idOf(row.item));
    if (!item) errors.push(`stockHistories[${index}].item: dangling reference`);
    if (!['warehouse', 'store'].includes(row.stockType)) errors.push(`stockHistories[${index}].stockType: invalid type`);
    if (row.stockType === 'warehouse' && (!row.warehouse || row.store)) errors.push(`stockHistories[${index}]: invalid warehouse location`);
    if (row.stockType === 'store' && (!row.store || row.warehouse)) errors.push(`stockHistories[${index}]: invalid store location`);
    if (row.warehouse && !byId.warehouses.has(idOf(row.warehouse))) errors.push(`stockHistories[${index}].warehouse: dangling reference`);
    if (row.store && !byId.stores.has(idOf(row.store))) errors.push(`stockHistories[${index}].store: dangling reference`);
    validateQuantity(row.qty ?? 0, `stockHistories[${index}].qty`, item && item.unit, errors);
    if (!finiteNumber(row.changeDelta)) errors.push(`stockHistories[${index}].changeDelta: must be numeric`);
    if (!STOCK_REASONS.has(row.reason)) errors.push(`stockHistories[${index}].reason: invalid reason ${row.reason}`);
    if (row.actor && !byId.users.has(idOf(row.actor))) errors.push(`stockHistories[${index}].actor: dangling reference`);
    validateDate(row.timestamp, `stockHistories[${index}].timestamp`, errors);
  });

  snapshot.driverLocations.forEach((row, index) => {
    const driver = idOf(row.driver);
    const user = byId.users.get(driver);
    if (!user) errors.push(`driverLocations[${index}].driver: dangling reference`);
    else if (user.role !== 'driver') errors.push(`driverLocations[${index}].driver: user is not a driver`);
    addUnique(locationDrivers, driver, `driverLocations[${index}].driver`, errors);
    validateCoords(row.coords, `driverLocations[${index}].coords`, errors);
    if (!row.coords || !finiteNumber(row.coords.lat) || !finiteNumber(row.coords.lng)) errors.push(`driverLocations[${index}].coords: latitude and longitude are required for import`);
    if (!DRIVER_STATUSES.has(row.status)) errors.push(`driverLocations[${index}].status: invalid status ${row.status}`);
    if (!finiteNumber(row.heading) || row.heading < 0 || row.heading > 359) errors.push(`driverLocations[${index}].heading: invalid heading`);
    if (!finiteNumber(row.speedKph) || row.speedKph < 0) errors.push(`driverLocations[${index}].speedKph: invalid speed`);
    validateDate(row.updatedAt, `driverLocations[${index}].updatedAt`, errors);
  });

  return errors;
}

function buildManifest(snapshot, errors = []) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    valid: errors.length === 0,
    errors,
    counts: Object.fromEntries(COLLECTIONS.map((collection) => [collection, snapshot[collection].length])),
  };
}

function toJsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

async function writeExport(directory, snapshot, manifest) {
  await fs.mkdir(directory, { recursive: true });
  for (const collection of COLLECTIONS) {
    await fs.writeFile(path.join(directory, `${collection}.jsonl`), snapshot[collection].map(toJsonLine).join(''), 'utf8');
  }
  const sourceIdMap = Object.fromEntries(COLLECTIONS.map((collection) => [collection, snapshot[collection].map((row) => idOf(row._id))]));
  await fs.writeFile(path.join(directory, 'source-id-map.json'), JSON.stringify(sourceIdMap, null, 2), 'utf8');
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
}

async function readExport(directory) {
  const snapshot = {};
  for (const collection of COLLECTIONS) {
    const text = await fs.readFile(path.join(directory, `${collection}.jsonl`), 'utf8');
    snapshot[collection] = text.trim() ? text.trim().split(/\r?\n/).map((line) => JSON.parse(line)) : [];
  }
  return snapshot;
}

module.exports = { COLLECTIONS, buildManifest, idOf, readExport, validateSnapshot, writeExport };
