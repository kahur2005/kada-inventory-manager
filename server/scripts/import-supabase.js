require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { createPostgresPool } = require('../config/postgres');
const { idOf, readExport, validateSnapshot } = require('./migration-data');

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function coord(row, key) {
  return row.coords && row.coords[key] !== null && row.coords[key] !== undefined ? row.coords[key] : null;
}

async function loadJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function normalizeAuthMap(value) {
  if (Array.isArray(value)) return Object.fromEntries(value.map((entry) => [String(entry.sourceId), entry.authUserId]));
  return value || {};
}

async function ensureMappedId(client, maps, collection, sourceId, requestedId = null) {
  const source = idOf(sourceId);
  const key = `${collection}:${source}`;
  if (maps.has(key)) {
    if (requestedId && maps.get(key) !== requestedId) throw new Error(`${key} already maps to a different target UUID`);
    return maps.get(key);
  }
  const existing = await client.query(
    'select target_id from private.mongo_id_map where source_collection = $1 and source_id = $2',
    [collection, source]
  );
  if (existing.rowCount) {
    if (requestedId && existing.rows[0].target_id !== requestedId) throw new Error(`${key} already maps to a different target UUID`);
    maps.set(key, existing.rows[0].target_id);
    return existing.rows[0].target_id;
  }
  const target = requestedId || crypto.randomUUID();
  await client.query(
    'insert into private.mongo_id_map (source_collection, source_id, target_id) values ($1, $2, $3)',
    [collection, source, target]
  );
  maps.set(key, target);
  return target;
}

async function insertRow(client, table, columns, values) {
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
  await client.query(`insert into public.${table} (${columns.join(', ')}) values (${placeholders}) on conflict (id) do nothing`, values);
}

async function main() {
  const directory = path.resolve(process.argv[2] || '.');
  const authMapFile = process.env.SUPABASE_AUTH_USER_MAP || process.argv[3];
  if (!authMapFile) throw new Error('A Supabase Auth mapping JSON file is required as the third argument or SUPABASE_AUTH_USER_MAP');
  const manifest = await loadJson(path.join(directory, 'manifest.json'));
  const snapshot = await readExport(directory);
  const errors = validateSnapshot(snapshot);
  if (!manifest.valid || errors.length) throw new Error(`Export is not valid; run validate-mongo-export.js first (${errors.length} errors)`);
  const authMap = normalizeAuthMap(await loadJson(path.resolve(authMapFile)));
  for (const user of snapshot.users) if (!authMap[idOf(user._id)]) throw new Error(`Missing Supabase Auth UUID for Mongo user ${idOf(user._id)}`);

  const pool = createPostgresPool();
  const client = await pool.connect();
  const maps = new Map();
  try {
    await client.query('begin');
    const warehouseTarget = new Map();
    const storeTarget = new Map();
    const itemTarget = new Map();
    const userTarget = new Map();
    const boxTarget = new Map();

    for (const row of snapshot.warehouses) {
      const target = await ensureMappedId(client, maps, 'warehouses', row._id);
      warehouseTarget.set(idOf(row._id), target);
      await insertRow(client, 'warehouses', ['id', 'name', 'address', 'latitude', 'longitude', 'capacity', 'area', 'created_at', 'updated_at'], [target, row.name, row.address || '', coord(row, 'lat'), coord(row, 'lng'), row.capacityM3 || 0, row.areaM2 || 0, isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }

    for (const row of snapshot.items) {
      const target = await ensureMappedId(client, maps, 'items', row._id);
      itemTarget.set(idOf(row._id), target);
      await insertRow(client, 'items', ['id', 'name', 'sku', 'unit', 'volume_m3', 'category', 'created_at', 'updated_at'], [target, row.name, String(row.sku).toUpperCase(), row.unit, row.volumeM3 || 0, row.category || '', isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }

    const storeWarehouseSource = new Map();
    for (const warehouse of snapshot.warehouses) for (const storeId of warehouse.stores || []) storeWarehouseSource.set(idOf(storeId), idOf(warehouse._id));
    for (const row of snapshot.stores) {
      const target = await ensureMappedId(client, maps, 'stores', row._id);
      storeTarget.set(idOf(row._id), target);
      await insertRow(client, 'stores', ['id', 'warehouse_id', 'name', 'address', 'latitude', 'longitude', 'created_at', 'updated_at'], [target, warehouseTarget.get(storeWarehouseSource.get(idOf(row._id))), row.name, row.address || '', coord(row, 'lat'), coord(row, 'lng'), isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }

    for (const row of snapshot.users) {
      const source = idOf(row._id);
      const target = await ensureMappedId(client, maps, 'users', source, authMap[source]);
      userTarget.set(source, target);
      await insertRow(client, 'profiles', ['id', 'name', 'email', 'role', 'warehouse_id', 'store_id', 'driver_qr_token', 'created_at', 'updated_at'], [target, row.name, String(row.email).toLowerCase(), row.role, row.warehouse ? warehouseTarget.get(idOf(row.warehouse)) : null, row.store ? storeTarget.get(idOf(row.store)) : null, row.driverQrToken || null, isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }

    for (const row of snapshot.warehouseStocks) {
      const target = await ensureMappedId(client, maps, 'warehouseStocks', row._id);
      await insertRow(client, 'warehouse_stocks', ['id', 'warehouse_id', 'item_id', 'qty', 'created_at', 'updated_at'], [target, warehouseTarget.get(idOf(row.warehouse)), itemTarget.get(idOf(row.item)), row.qty ?? 0, isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }
    for (const row of snapshot.storeStocks) {
      const target = await ensureMappedId(client, maps, 'storeStocks', row._id);
      await insertRow(client, 'store_stocks', ['id', 'store_id', 'item_id', 'qty', 'threshold', 'max_level', 'created_at', 'updated_at'], [target, storeTarget.get(idOf(row.store)), itemTarget.get(idOf(row.item)), row.qty ?? 0, row.threshold ?? 0, row.maxLevel ?? 0, isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
    }

    for (const row of snapshot.boxes) {
      const target = await ensureMappedId(client, maps, 'boxes', row._id);
      boxTarget.set(idOf(row._id), target);
      await insertRow(client, 'boxes', ['id', 'code', 'qr_token', 'warehouse_id', 'destination_store_id', 'assigned_driver_id', 'status', 'expected_arrival', 'created_at', 'updated_at'], [target, row.code, row.qrToken, warehouseTarget.get(idOf(row.warehouse)), storeTarget.get(idOf(row.destinationStore)), row.assignedDriver ? userTarget.get(idOf(row.assignedDriver)) : null, row.status, isoOrNull(row.expectedArrival), isoOrNull(row.createdAt), isoOrNull(row.updatedAt)]);
      for (const line of row.items || []) await client.query('insert into public.box_items (box_id, item_id, qty) values ($1, $2, $3) on conflict (box_id, item_id) do nothing', [target, itemTarget.get(idOf(line.item)), line.qty]);
    }

    for (const row of snapshot.handoverLogs) {
      await insertRow(client, 'handover_logs', ['id', 'box_id', 'actor_id', 'action', 'latitude', 'longitude', 'meta', 'occurred_at', 'created_at'], [await ensureMappedId(client, maps, 'handoverLogs', row._id), row.box ? boxTarget.get(idOf(row.box)) : null, userTarget.get(idOf(row.actor)), row.action, coord(row, 'lat'), coord(row, 'lng'), row.meta || {}, isoOrNull(row.timestamp), isoOrNull(row.createdAt)]);
    }
    for (const row of snapshot.stockHistories) {
      await insertRow(client, 'stock_history', ['id', 'stock_type', 'warehouse_id', 'store_id', 'item_id', 'qty_snapshot', 'change_delta', 'reason', 'actor_id', 'occurred_at', 'created_at'], [await ensureMappedId(client, maps, 'stockHistories', row._id), row.stockType, row.warehouse ? warehouseTarget.get(idOf(row.warehouse)) : null, row.store ? storeTarget.get(idOf(row.store)) : null, itemTarget.get(idOf(row.item)), row.qty ?? 0, row.changeDelta ?? 0, row.reason, row.actor ? userTarget.get(idOf(row.actor)) : null, isoOrNull(row.timestamp), isoOrNull(row.createdAt)]);
    }
    for (const row of snapshot.driverLocations) {
      await insertRow(client, 'driver_locations', ['id', 'driver_id', 'latitude', 'longitude', 'heading', 'speed', 'status', 'updated_at', 'created_at'], [await ensureMappedId(client, maps, 'driverLocations', row._id), userTarget.get(idOf(row.driver)), coord(row, 'lat'), coord(row, 'lng'), row.heading ?? 0, row.speedKph ?? 0, row.status, isoOrNull(row.updatedAt), isoOrNull(row.createdAt)]);
    }
    await client.query('commit');
    console.log(JSON.stringify({ imported: manifest.counts, mapped: maps.size }, null, 2));
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { ensureMappedId, normalizeAuthMap };
