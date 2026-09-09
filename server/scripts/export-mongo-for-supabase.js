require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Warehouse = require('../models/Warehouse');
const Store = require('../models/Store');
const Item = require('../models/Item');
const WarehouseStock = require('../models/WarehouseStock');
const StoreStock = require('../models/StoreStock');
const Box = require('../models/Box');
const HandoverLog = require('../models/HandoverLog');
const StockHistory = require('../models/StockHistory');
const DriverLocation = require('../models/DriverLocation');
const { buildManifest, validateSnapshot, writeExport } = require('./migration-data');

const models = {
  users: User,
  warehouses: Warehouse,
  stores: Store,
  items: Item,
  warehouseStocks: WarehouseStock,
  storeStocks: StoreStock,
  boxes: Box,
  handoverLogs: HandoverLog,
  stockHistories: StockHistory,
  driverLocations: DriverLocation,
};

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI (or MONGODB_URI) is required');
  const outputDirectory = path.resolve(process.argv[2] || path.join(__dirname, '..', '.migration-export', new Date().toISOString().replace(/[:.]/g, '-')));

  await connectDB(mongoUri);
  const snapshot = {};
  for (const [collection, model] of Object.entries(models)) snapshot[collection] = await model.find().lean();
  const errors = validateSnapshot(snapshot);
  const manifest = buildManifest(snapshot, errors);
  await writeExport(outputDirectory, snapshot, manifest);
  await mongoose.connection.close();

  console.log(JSON.stringify({ outputDirectory, manifest }, null, 2));
  if (errors.length) process.exitCode = 2;
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  await mongoose.connection.close().catch(() => {});
  process.exitCode = 1;
});
