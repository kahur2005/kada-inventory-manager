require('dotenv').config();

const { createPostgresPool } = require('../config/postgres');

const checks = {
  warehouses: 'select count(*)::int as count from public.warehouses',
  stores: 'select count(*)::int as count from public.stores',
  items: 'select count(*)::int as count from public.items',
  profiles: 'select count(*)::int as count from public.profiles',
  warehouseStocks: 'select count(*)::int as count from public.warehouse_stocks',
  storeStocks: 'select count(*)::int as count from public.store_stocks',
  boxes: 'select count(*)::int as count from public.boxes',
  boxItems: 'select count(*)::int as count from public.box_items',
  handoverLogs: 'select count(*)::int as count from public.handover_logs',
  stockHistory: 'select count(*)::int as count from public.stock_history',
  driverLocations: 'select count(*)::int as count from public.driver_locations',
  orphanBoxItems: 'select count(*)::int as count from public.box_items bi left join public.boxes b on b.id = bi.box_id where b.id is null',
  orphanStores: 'select count(*)::int as count from public.stores s left join public.warehouses w on w.id = s.warehouse_id where w.id is null',
  orphanProfiles: 'select count(*)::int as count from public.profiles p left join auth.users u on u.id = p.id where u.id is null',
};

async function main() {
  const pool = createPostgresPool();
  try {
    const result = {};
    for (const [name, sql] of Object.entries(checks)) result[name] = (await pool.query(sql)).rows[0].count;
    const failures = Object.entries(result).filter(([name, count]) => name.startsWith('orphan') && count !== 0);
    console.log(JSON.stringify({ result, valid: failures.length === 0, failures: Object.fromEntries(failures) }, null, 2));
    if (failures.length) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
