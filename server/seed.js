require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const User = require('./models/User');
const Warehouse = require('./models/Warehouse');
const Store = require('./models/Store');
const Item = require('./models/Item');
const WarehouseStock = require('./models/WarehouseStock');
const StoreStock = require('./models/StoreStock');
const Box = require('./models/Box');
const HandoverLog = require('./models/HandoverLog');
const DriverLocation = require('./models/DriverLocation');

const ITEM_DEFS = [
  { name: 'Indomie Goreng', sku: 'IDG-001', unit: 'pcs', volumeM3: 0.0005 },
  { name: 'Beras 5kg', sku: 'BRS-005', unit: 'kg', volumeM3: 0.006 },
  { name: 'Minyak Goreng 1L', sku: 'MYK-001', unit: 'pcs', volumeM3: 0.001 },
  { name: 'Gula Pasir 1kg', sku: 'GLA-001', unit: 'kg', volumeM3: 0.001 },
  { name: 'Teh Celup', sku: 'TEH-001', unit: 'box', volumeM3: 0.0008 },
  { name: 'Kopi Sachet', sku: 'KPI-001', unit: 'box', volumeM3: 0.0008 },
  { name: 'Sabun Mandi', sku: 'SBN-001', unit: 'pcs', volumeM3: 0.0003 },
  { name: 'Shampoo Sachet', sku: 'SHP-001', unit: 'box', volumeM3: 0.0006 },
  { name: 'Air Mineral 600ml', sku: 'AIR-001', unit: 'pcs', volumeM3: 0.0007 },
  { name: 'Deterjen Bubuk', sku: 'DTR-001', unit: 'kg', volumeM3: 0.002 },
];

async function seed() {
  await connectDB(process.env.MONGO_URI);

  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}),
    Warehouse.deleteMany({}),
    Store.deleteMany({}),
    Item.deleteMany({}),
    WarehouseStock.deleteMany({}),
    StoreStock.deleteMany({}),
    Box.deleteMany({}),
    HandoverLog.deleteMany({}),
    DriverLocation.deleteMany({}),
  ]);

  const stores = await Store.insertMany([
    { name: 'Alfamart Sudirman', address: 'Jl. Sudirman No. 1, Jakarta', coords: { lat: -6.2088, lng: 106.8456 } },
    { name: 'Alfamart Thamrin', address: 'Jl. Thamrin No. 5, Jakarta', coords: { lat: -6.1944, lng: 106.8229 } },
    { name: 'Alfamart Kemang', address: 'Jl. Kemang Raya No. 10, Jakarta', coords: { lat: -6.2608, lng: 106.8135 } },
  ]);

  const warehouses = await Warehouse.insertMany([
    {
      name: 'Warehouse Cakung',
      address: 'Jl. Raya Cakung, Jakarta',
      coords: { lat: -6.1701, lng: 106.9412 },
      capacityM3: 500,
      areaM2: 300,
      stores: [stores[0]._id, stores[1]._id],
    },
    {
      name: 'Warehouse Cibitung',
      address: 'Jl. Industri Cibitung, Bekasi',
      coords: { lat: -6.2434, lng: 107.1229 },
      capacityM3: 400,
      areaM2: 250,
      stores: [stores[2]._id],
    },
  ]);

  const items = await Item.insertMany(ITEM_DEFS);

  const passwordHash = await bcrypt.hash('password123', 10);
  const [, , , driver] = await User.create([
    { name: 'Super Admin', email: 'superadmin@logistiq.demo', passwordHash, role: 'superadmin' },
    { name: 'Warehouse Admin', email: 'warehouse@logistiq.demo', passwordHash, role: 'warehouse_admin', warehouse: warehouses[0]._id },
    { name: 'Store Admin', email: 'store@logistiq.demo', passwordHash, role: 'store_admin', store: stores[0]._id },
    { name: 'Driver One', email: 'driver@logistiq.demo', passwordHash, role: 'driver', driverQrToken: uuidv4() },
  ]);

  const warehouseStockDocs = [];
  for (const wh of warehouses) {
    for (const item of items) {
      warehouseStockDocs.push({ warehouse: wh._id, item: item._id, qty: 100 });
    }
  }
  await WarehouseStock.insertMany(warehouseStockDocs);

  // Every store gets stock for every item; Store 1's first two items are deliberately
  // under threshold so /warehouse/alerts has something to show the moment the demo starts.
  const storeStockDocs = [];
  stores.forEach((store, storeIdx) => {
    items.forEach((item, itemIdx) => {
      const isDemoLowStock = storeIdx === 0 && itemIdx < 2;
      storeStockDocs.push({
        store: store._id,
        item: item._id,
        qty: isDemoLowStock ? 3 : 50,
        threshold: 10,
      });
    });
  });
  await StoreStock.insertMany(storeStockDocs);

  console.log('Seed complete. Demo accounts (all passwords: password123):');
  console.log('  superadmin@logistiq.demo');
  console.log(`  warehouse@logistiq.demo (${warehouses[0].name})`);
  console.log(`  store@logistiq.demo (${stores[0].name})`);
  console.log(`  driver@logistiq.demo (driverQrToken: ${driver.driverQrToken})`);

  await mongoose.connection.close();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
