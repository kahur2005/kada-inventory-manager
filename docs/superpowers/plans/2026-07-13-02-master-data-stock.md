# LogistiQ Plan 2: Master Data & Stock (Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans 0 (Foundation) and 1 (Auth & RBAC) are complete. This plan assumes `authRequired`/`requireRole`, `Layout`'s `NAV_ITEMS` map, `RoleRedirect`'s `ROLE_HOME` map, `apiClient`, and the `{ resourceName, total, page, limit }` list-response convention all exist exactly as Plan 1 left them.

**Goal:** Ship full CRUD for the item catalog, warehouses, and stores; warehouse-stock (add-only) and store-stock (with thresholds, alerts, and end-of-day opname) endpoints and screens — the master-data backbone every box/QR/driver flow in Plans 3–4 reads and writes against.

**Architecture:** Six new Express controller/route pairs mounted on `app.js`, all following Plan 1's auth/scoping patterns. Six new React pages, one new shared `MapPicker` component (Leaflet click-to-set-coords, per the PRD's "no geocoding" requirement).

**Tech Stack:** Adds `leaflet` + `react-leaflet` (client).

## Global Constraints

- List-response shape stays `{ resourceName, total?, page?, limit? }` (Plan 1's convention) — simple un-paginated lists (items, warehouses, stores — small collections for a class project) may omit `total/page/limit` and just return the array under the resource key, e.g. `{ items: [...] }`.
- `StoreStock` rows are **never created directly through an admin CRUD endpoint** — there is no `POST /store-stock` in the PRD's endpoint table. Rows come from two places only: the demo seed script (Plan 4, `seed.js` inserts rows directly via Mongoose) and box delivery (Plan 3's `POST /scan/box`, which upserts on delivery). This plan's endpoints only ever `PATCH` existing rows (`adjust`, `threshold`) or `GET` them.
- Coordinates for warehouses/stores are set by **clicking a Leaflet map** — no geocoding API, no manual lat/lng text inputs.
- `warehouse_admin` is scoped to exactly one warehouse (`req.user.warehouse`); every endpoint they can reach must verify the resource belongs to their warehouse (directly, or via `warehouse.stores` for store-scoped resources).
- `store_admin` is scoped to exactly one store (`req.user.store`); same rule.
- Leaflet/react-leaflet map components are exercised by mocking `react-leaflet`'s exports in unit tests (Leaflet manipulates real DOM measurements jsdom doesn't provide) — tests verify the click→callback wiring this project's code owns, not Leaflet's internal rendering. Full visual verification of the map happens in this plan's manual end-to-end steps.

---

## File Structure

```
/server
  /controllers/itemController.js
  /controllers/storeController.js
  /controllers/warehouseController.js
  /controllers/warehouseStockController.js
  /controllers/storeStockController.js
  /controllers/alertsController.js
  /routes/itemRoutes.js
  /routes/storeRoutes.js
  /routes/warehouseRoutes.js
  /routes/warehouseStockRoutes.js
  /routes/storeStockRoutes.js
  /routes/alertsRoutes.js
  /app.js                                  # MODIFY: mount 6 new routers
  /tests/controllers/items.test.js
  /tests/controllers/stores.test.js
  /tests/controllers/warehouses.test.js
  /tests/controllers/warehouseStock.test.js
  /tests/controllers/storeStock.test.js
  /tests/controllers/alerts.test.js
/client
  /src/components/MapPicker.jsx
  /src/test/MapPicker.test.jsx
  /src/pages/admin/ItemsPage.jsx
  /src/pages/admin/WarehousesPage.jsx
  /src/pages/admin/StoresPage.jsx
  /src/pages/admin/WarehouseStockPage.jsx
  /src/pages/warehouse/AlertsPage.jsx
  /src/pages/warehouse/StockPage.jsx
  /src/pages/store/StockPage.jsx
  /src/App.jsx                             # MODIFY: mount 7 new routes
  /src/components/Layout.jsx               # MODIFY: NAV_ITEMS additions
  /src/components/RoleRedirect.jsx          # MODIFY: warehouse_admin -> /warehouse/alerts
  /src/test/admin/ItemsPage.test.jsx
  /src/test/admin/WarehousesPage.test.jsx
  /src/test/admin/StoresPage.test.jsx
  /src/test/admin/WarehouseStockPage.test.jsx
  /src/test/warehouse/AlertsPage.test.jsx
  /src/test/warehouse/StockPage.test.jsx
  /src/test/store/StockPage.test.jsx
```

---

### Task 1: Item catalog CRUD

**Files:**
- Create: `server/controllers/itemController.js`
- Create: `server/routes/itemRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/items.test.js`

**Interfaces:**
- Produces: `GET /api/items` (any authenticated role) → `200 { items }`. `POST/PATCH/DELETE /api/items[/:id]` (superadmin only).

- [ ] **Step 1: Write failing test**

`server/tests/controllers/items.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const { signToken } = require('../../middleware/auth');

async function tokenFor(role) {
  const user = await User.create({ name: role, email: `${role}@example.com`, passwordHash: 'x', role });
  return signToken(user);
}

describe('Item catalog', () => {
  test('any authenticated role can list items', async () => {
    const token = await tokenFor('driver');
    const res = await request(app).get('/api/items').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('superadmin can create, update, and delete an item', async () => {
    const token = await tokenFor('superadmin');
    const create = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Indomie Goreng', sku: 'sku-001', unit: 'pcs' });
    expect(create.status).toBe(201);
    expect(create.body.item.sku).toBe('SKU-001');

    const id = create.body.item._id;
    const update = await request(app)
      .patch(`/api/items/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Indomie Goreng Rendang' });
    expect(update.status).toBe(200);
    expect(update.body.item.name).toBe('Indomie Goreng Rendang');

    const del = await request(app).delete(`/api/items/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  test('non-superadmin cannot create an item', async () => {
    const token = await tokenFor('warehouse_admin');
    const res = await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'X', sku: 'X1' });
    expect(res.status).toBe(403);
  });

  test('rejects duplicate sku on create', async () => {
    const token = await tokenFor('superadmin');
    await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'A', sku: 'DUP' });
    const res = await request(app).post('/api/items').set('Authorization', `Bearer ${token}`).send({ name: 'B', sku: 'DUP' });
    expect(res.status).toBe(400);
  });
});
```

Run: `npm test --prefix server -- items.test.js`
Expected: FAIL — `/api/items` isn't mounted yet (404s).

- [ ] **Step 2: Implement `server/controllers/itemController.js`**

```js
const Item = require('../models/Item');

async function listItems(req, res) {
  const items = await Item.find().sort({ name: 1 });
  res.json({ items });
}

async function createItem(req, res) {
  const { name, sku, unit, volumeM3 } = req.body;
  if (!name || !sku) {
    return res.status(400).json({ message: 'name and sku are required' });
  }
  const existing = await Item.findOne({ sku: sku.toUpperCase() });
  if (existing) {
    return res.status(400).json({ message: 'sku already exists' });
  }
  const item = await Item.create({ name, sku, unit, volumeM3 });
  res.status(201).json({ item });
}

async function updateItem(req, res) {
  const { name, unit, volumeM3 } = req.body;
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (volumeM3 !== undefined) item.volumeM3 = volumeM3;
  await item.save();
  res.json({ item });
}

async function deleteItem(req, res) {
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json({ message: 'Item deleted' });
}

module.exports = { listItems, createItem, updateItem, deleteItem };
```

- [ ] **Step 3: Implement `server/routes/itemRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listItems, createItem, updateItem, deleteItem } = require('../controllers/itemController');

router.use(authRequired);
router.get('/', listItems);
router.post('/', requireRole('superadmin'), createItem);
router.patch('/:id', requireRole('superadmin'), updateItem);
router.delete('/:id', requireRole('superadmin'), deleteItem);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- items.test.js`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/itemController.js server/routes/itemRoutes.js server/app.js server/tests/controllers/items.test.js
git commit -m "feat: add item catalog CRUD endpoints"
```

---

### Task 2: Store CRUD (scoped reads)

**Files:**
- Create: `server/controllers/storeController.js`
- Create: `server/routes/storeRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/stores.test.js`

**Interfaces:**
- Produces: `GET /api/stores` (superadmin: all; store_admin: only their own store, or `[]` if unassigned to one) → `200 { stores }`. `POST/PATCH/DELETE /api/stores[/:id]` (superadmin only).

- [ ] **Step 1: Write failing test**

`server/tests/controllers/stores.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const { signToken } = require('../../middleware/auth');

describe('Store CRUD', () => {
  test('superadmin sees all stores', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await Store.create({ name: 'Store 1', address: 'A' });
    await Store.create({ name: 'Store 2', address: 'B' });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(2);
  });

  test('store_admin only sees their own store', async () => {
    const store1 = await Store.create({ name: 'Store 1', address: 'A' });
    await Store.create({ name: 'Store 2', address: 'B' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store1._id });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.stores).toHaveLength(1);
    expect(res.body.stores[0].name).toBe('Store 1');
  });

  test('driver cannot list stores', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/stores').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });

  test('superadmin creates a store with coords set by map click', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app)
      .post('/api/stores')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ name: 'Store 3', address: 'C', coords: { lat: -6.2, lng: 106.8 } });
    expect(res.status).toBe(201);
    expect(res.body.store.coords.lat).toBe(-6.2);
  });
});
```

Run: `npm test --prefix server -- stores.test.js`
Expected: FAIL — `/api/stores` not mounted.

- [ ] **Step 2: Implement `server/controllers/storeController.js`**

```js
const Store = require('../models/Store');

async function listStores(req, res) {
  if (req.user.role === 'store_admin') {
    const stores = req.user.store ? await Store.find({ _id: req.user.store }) : [];
    return res.json({ stores });
  }
  const stores = await Store.find().sort({ name: 1 });
  res.json({ stores });
}

async function createStore(req, res) {
  const { name, address, coords } = req.body;
  if (!name || !address) {
    return res.status(400).json({ message: 'name and address are required' });
  }
  const store = await Store.create({ name, address, coords });
  res.status(201).json({ store });
}

async function updateStore(req, res) {
  const { name, address, coords } = req.body;
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ message: 'Store not found' });
  if (name !== undefined) store.name = name;
  if (address !== undefined) store.address = address;
  if (coords !== undefined) store.coords = coords;
  await store.save();
  res.json({ store });
}

async function deleteStore(req, res) {
  const store = await Store.findByIdAndDelete(req.params.id);
  if (!store) return res.status(404).json({ message: 'Store not found' });
  res.json({ message: 'Store deleted' });
}

module.exports = { listStores, createStore, updateStore, deleteStore };
```

- [ ] **Step 3: Implement `server/routes/storeRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listStores, createStore, updateStore, deleteStore } = require('../controllers/storeController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'store_admin'), listStores);
router.post('/', requireRole('superadmin'), createStore);
router.patch('/:id', requireRole('superadmin'), updateStore);
router.delete('/:id', requireRole('superadmin'), deleteStore);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/stores', require('./routes/storeRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- stores.test.js`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/storeController.js server/routes/storeRoutes.js server/app.js server/tests/controllers/stores.test.js
git commit -m "feat: add store CRUD endpoints with store_admin scoping"
```

---

### Task 3: Warehouse CRUD (scoped reads, stores linkage, utilization)

**Files:**
- Create: `server/controllers/warehouseController.js`
- Create: `server/routes/warehouseRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/warehouses.test.js`

**Interfaces:**
- Consumes: `WarehouseStock` model (Plan 0) to compute utilization.
- Produces: `GET /api/warehouses` (superadmin: all; warehouse_admin: only their own, or `[]`) → `200 { warehouses }`, each warehouse object extended with `usedM3` (Σ `WarehouseStock.qty × Item.volumeM3` for that warehouse) and `utilizationPct` (`round(usedM3 / capacityM3 * 100)`, `0` if `capacityM3` is `0`). `POST/PATCH/DELETE /api/warehouses[/:id]` (superadmin only) — `stores` field on the body is the array of `Store` ids to link.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/warehouses.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const WarehouseStock = require('../../models/WarehouseStock');
const { signToken } = require('../../middleware/auth');

describe('Warehouse CRUD', () => {
  test('superadmin creates a warehouse linked to stores', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const store = await Store.create({ name: 'Store 1', address: 'A' });
    const res = await request(app)
      .post('/api/warehouses')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ name: 'WH A', address: 'X', coords: { lat: -6.3, lng: 106.9 }, capacityM3: 100, areaM2: 50, stores: [store._id.toString()] });
    expect(res.status).toBe(201);
    expect(res.body.warehouse.stores).toHaveLength(1);
  });

  test('warehouse_admin only sees their own warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    await Warehouse.create({ name: 'WH2', address: 'y' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.warehouses).toHaveLength(1);
    expect(res.body.warehouses[0].name).toBe('WH1');
  });

  test('computes usedM3 and utilizationPct from warehouse stock', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x', capacityM3: 100 });
    const item = await Item.create({ name: 'Box', sku: 'BOX1', volumeM3: 2 });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 10 });

    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(admin)}`);
    const found = res.body.warehouses.find((w) => w._id === wh._id.toString());
    expect(found.usedM3).toBe(20);
    expect(found.utilizationPct).toBe(20);
  });

  test('driver cannot list warehouses', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- warehouses.test.js`
Expected: FAIL — `/api/warehouses` not mounted.

- [ ] **Step 2: Implement `server/controllers/warehouseController.js`**

```js
const Warehouse = require('../models/Warehouse');
const WarehouseStock = require('../models/WarehouseStock');

async function computeUtilization(warehouse) {
  const rows = await WarehouseStock.find({ warehouse: warehouse._id }).populate('item', 'volumeM3');
  const usedM3 = rows.reduce((sum, row) => sum + (row.item?.volumeM3 || 0) * row.qty, 0);
  const utilizationPct = warehouse.capacityM3 > 0 ? Math.round((usedM3 / warehouse.capacityM3) * 100) : 0;
  return { usedM3, utilizationPct };
}

async function withUtilization(warehouses) {
  return Promise.all(
    warehouses.map(async (wh) => ({ ...wh.toObject(), ...(await computeUtilization(wh)) }))
  );
}

async function listWarehouses(req, res) {
  let warehouses;
  if (req.user.role === 'warehouse_admin') {
    warehouses = req.user.warehouse
      ? await Warehouse.find({ _id: req.user.warehouse }).populate('stores', 'name address')
      : [];
  } else {
    warehouses = await Warehouse.find().populate('stores', 'name address').sort({ name: 1 });
  }
  res.json({ warehouses: await withUtilization(warehouses) });
}

async function createWarehouse(req, res) {
  const { name, address, coords, capacityM3, areaM2, stores } = req.body;
  if (!name || !address) {
    return res.status(400).json({ message: 'name and address are required' });
  }
  const warehouse = await Warehouse.create({ name, address, coords, capacityM3, areaM2, stores });
  res.status(201).json({ warehouse });
}

async function updateWarehouse(req, res) {
  const { name, address, coords, capacityM3, areaM2, stores } = req.body;
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
  if (name !== undefined) warehouse.name = name;
  if (address !== undefined) warehouse.address = address;
  if (coords !== undefined) warehouse.coords = coords;
  if (capacityM3 !== undefined) warehouse.capacityM3 = capacityM3;
  if (areaM2 !== undefined) warehouse.areaM2 = areaM2;
  if (stores !== undefined) warehouse.stores = stores;
  await warehouse.save();
  res.json({ warehouse });
}

async function deleteWarehouse(req, res) {
  const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
  if (!warehouse) return res.status(404).json({ message: 'Warehouse not found' });
  res.json({ message: 'Warehouse deleted' });
}

module.exports = { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse };
```

- [ ] **Step 3: Implement `server/routes/warehouseRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } = require('../controllers/warehouseController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin'), listWarehouses);
router.post('/', requireRole('superadmin'), createWarehouse);
router.patch('/:id', requireRole('superadmin'), updateWarehouse);
router.delete('/:id', requireRole('superadmin'), deleteWarehouse);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/stores', require('./routes/storeRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- warehouses.test.js`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/warehouseController.js server/routes/warehouseRoutes.js server/app.js server/tests/controllers/warehouses.test.js
git commit -m "feat: add warehouse CRUD endpoints with stores linkage and utilization"
```

---

### Task 4: Warehouse stock — list + add-only

**Files:**
- Create: `server/controllers/warehouseStockController.js`
- Create: `server/routes/warehouseStockRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/warehouseStock.test.js`

**Interfaces:**
- Consumes: `WarehouseStock` (Plan 0), `HandoverLog` (Plan 0).
- Produces: `GET /api/warehouse-stock?warehouse=<id>` (superadmin; warehouse_admin only for their own warehouse) → `200 { warehouseStock }` (each row has `item` populated with `name, sku, unit, volumeM3`). `POST /api/warehouse-stock/add { warehouse, item, qty }` (superadmin only) → `201 { warehouseStock }`, upserts by `$inc`, and writes a `WAREHOUSE_STOCK_ADDED` `HandoverLog` with `meta: { warehouse, item, qtyAdded }`. This is the only way warehouse stock quantities increase — Plan 3's box creation is the only way they decrease.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/warehouseStock.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

describe('Warehouse stock', () => {
  test('superadmin adds stock, creating a row and a HandoverLog entry', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });

    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(admin)}`)
      .send({ warehouse: wh._id.toString(), item: item._id.toString(), qty: 15 });

    expect(res.status).toBe(201);
    expect(res.body.warehouseStock.qty).toBe(15);
    const logs = await HandoverLog.find({ action: 'WAREHOUSE_STOCK_ADDED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].meta.qtyAdded).toBe(15);
  });

  test('adding stock twice for the same (warehouse, item) increments qty', async () => {
    const admin = await User.create({ name: 'S2', email: 's2@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    await request(app).post('/api/warehouse-stock/add').set('Authorization', `Bearer ${signToken(admin)}`).send({ warehouse: wh._id, item: item._id, qty: 5 });
    const res = await request(app).post('/api/warehouse-stock/add').set('Authorization', `Bearer ${signToken(admin)}`).send({ warehouse: wh._id, item: item._id, qty: 3 });
    expect(res.body.warehouseStock.qty).toBe(8);
  });

  test('warehouse_admin cannot read another warehouse\'s stock', async () => {
    const wh1 = await Warehouse.create({ name: 'WH3', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH4', address: 'y' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app)
      .get(`/api/warehouse-stock?warehouse=${wh2._id}`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });

  test('warehouse_admin cannot add stock', async () => {
    const wh = await Warehouse.create({ name: 'WH5', address: 'x' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const res = await request(app)
      .post('/api/warehouse-stock/add')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ warehouse: wh._id, item: item._id, qty: 1 });
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- warehouseStock.test.js`
Expected: FAIL — routes not mounted.

- [ ] **Step 2: Implement `server/controllers/warehouseStockController.js`**

```js
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');

async function listWarehouseStock(req, res) {
  const { warehouse } = req.query;
  if (!warehouse) {
    return res.status(400).json({ message: 'warehouse query param is required' });
  }
  if (req.user.role === 'warehouse_admin' && req.user.warehouse !== warehouse) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await WarehouseStock.find({ warehouse }).populate('item', 'name sku unit volumeM3');
  res.json({ warehouseStock: rows });
}

async function addWarehouseStock(req, res) {
  const { warehouse, item, qty } = req.body;
  if (!warehouse || !item || !qty || qty <= 0) {
    return res.status(400).json({ message: 'warehouse, item, and a positive qty are required' });
  }
  const row = await WarehouseStock.findOneAndUpdate(
    { warehouse, item },
    { $inc: { qty } },
    { upsert: true, new: true }
  ).populate('item', 'name sku unit volumeM3');
  await HandoverLog.create({
    actor: req.user.id,
    action: 'WAREHOUSE_STOCK_ADDED',
    meta: { warehouse, item, qtyAdded: qty },
  });
  res.status(201).json({ warehouseStock: row });
}

module.exports = { listWarehouseStock, addWarehouseStock };
```

- [ ] **Step 3: Implement `server/routes/warehouseStockRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listWarehouseStock, addWarehouseStock } = require('../controllers/warehouseStockController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin'), listWarehouseStock);
router.post('/add', requireRole('superadmin'), addWarehouseStock);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/warehouse-stock', require('./routes/warehouseStockRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- warehouseStock.test.js`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/warehouseStockController.js server/routes/warehouseStockRoutes.js server/app.js server/tests/controllers/warehouseStock.test.js
git commit -m "feat: add warehouse stock list and add-only endpoints"
```

---

### Task 5: Store stock — list (with belowThreshold), opname adjust, threshold

**Files:**
- Create: `server/controllers/storeStockController.js`
- Create: `server/routes/storeStockRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/storeStock.test.js`

**Interfaces:**
- Consumes: `StoreStock`, `Warehouse`, `HandoverLog` (Plan 0).
- Produces:
  - `GET /api/store-stock?store=<id>` (superadmin: any; warehouse_admin: only if `store` is in their warehouse's `stores[]`; store_admin: only their own store) → `200 { storeStock }`, each row has `item` populated and a computed `belowThreshold: boolean`.
  - `PATCH /api/store-stock/:id/adjust { qty }` (store_admin only, only their own store's rows) → `200 { storeStock }`; writes a `STOCK_ADJUSTED` `HandoverLog` with `meta: { storeStockId, oldQty, newQty }`. This is the opname endpoint.
  - `PATCH /api/store-stock/:id/threshold { threshold }` (superadmin, or warehouse_admin if the row's store is in their linked stores) → `200 { storeStock }`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/storeStock.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const StoreStock = require('../../models/StoreStock');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

describe('Store stock', () => {
  test('GET returns belowThreshold flag and is scoped for store_admin', async () => {
    const store = await Store.create({ name: 'S1', address: 'x' });
    const otherStore = await Store.create({ name: 'S2', address: 'y' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    await StoreStock.create({ store: otherStore._id, item: item._id, qty: 20, threshold: 5 });

    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app).get(`/api/store-stock?store=${store._id}`).set('Authorization', `Bearer ${signToken(storeAdmin)}`);

    expect(res.status).toBe(200);
    expect(res.body.storeStock).toHaveLength(1);
    expect(res.body.storeStock[0].belowThreshold).toBe(true);
    expect(res.body.storeStock[0]._id).toBe(row._id.toString());
  });

  test('store_admin cannot read another store\'s stock', async () => {
    const store = await Store.create({ name: 'S3', address: 'x' });
    const otherStore = await Store.create({ name: 'S4', address: 'y' });
    const storeAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app).get(`/api/store-stock?store=${otherStore._id}`).set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.status).toBe(403);
  });

  test('opname: store_admin adjusts qty and logs STOCK_ADJUSTED', async () => {
    const store = await Store.create({ name: 'S5', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA3', email: 'sa3@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });

    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/adjust`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ qty: 9 });

    expect(res.status).toBe(200);
    expect(res.body.storeStock.qty).toBe(9);
    const logs = await HandoverLog.find({ action: 'STOCK_ADJUSTED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toEqual({ storeStockId: row._id.toString(), oldQty: 3, newQty: 9 });
  });

  test('opname: store_admin cannot adjust another store\'s row', async () => {
    const store = await Store.create({ name: 'S6', address: 'x' });
    const otherStore = await Store.create({ name: 'S7', address: 'y' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const row = await StoreStock.create({ store: otherStore._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA4', email: 'sa4@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/adjust`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ qty: 1 });
    expect(res.status).toBe(403);
  });

  test('threshold: warehouse_admin sets threshold for a linked store', async () => {
    const store = await Store.create({ name: 'S8', address: 'x' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x', stores: [store._id] });
    const item = await Item.create({ name: 'D', sku: 'D1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });

    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/threshold`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ threshold: 20 });

    expect(res.status).toBe(200);
    expect(res.body.storeStock.threshold).toBe(20);
  });

  test('threshold: store_admin cannot set threshold', async () => {
    const store = await Store.create({ name: 'S9', address: 'x' });
    const item = await Item.create({ name: 'E', sku: 'E1' });
    const row = await StoreStock.create({ store: store._id, item: item._id, qty: 3, threshold: 10 });
    const storeAdmin = await User.create({ name: 'SA5', email: 'sa5@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .patch(`/api/store-stock/${row._id}/threshold`)
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ threshold: 1 });
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- storeStock.test.js`
Expected: FAIL — routes not mounted.

- [ ] **Step 2: Implement `server/controllers/storeStockController.js`**

```js
const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');
const HandoverLog = require('../models/HandoverLog');

async function canReadStore(req, storeId) {
  if (req.user.role === 'superadmin') return true;
  if (req.user.role === 'store_admin') return req.user.store === storeId;
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    return !!wh && wh.stores.some((s) => s.toString() === storeId);
  }
  return false;
}

async function listStoreStock(req, res) {
  const { store } = req.query;
  if (!store) {
    return res.status(400).json({ message: 'store query param is required' });
  }
  if (!(await canReadStore(req, store))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const rows = await StoreStock.find({ store }).populate('item', 'name sku unit');
  const withFlag = rows.map((row) => ({ ...row.toObject(), belowThreshold: row.qty < row.threshold }));
  res.json({ storeStock: withFlag });
}

async function adjustStoreStock(req, res) {
  const { qty } = req.body;
  if (qty === undefined || qty < 0) {
    return res.status(400).json({ message: 'a non-negative qty is required' });
  }
  if (req.user.role !== 'store_admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const row = await StoreStock.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Store stock row not found' });
  if (req.user.store !== row.store.toString()) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const oldQty = row.qty;
  row.qty = qty;
  await row.save();
  await HandoverLog.create({
    actor: req.user.id,
    action: 'STOCK_ADJUSTED',
    meta: { storeStockId: row._id.toString(), oldQty, newQty: qty },
  });
  res.json({ storeStock: row });
}

async function setThreshold(req, res) {
  const { threshold } = req.body;
  if (threshold === undefined || threshold < 0) {
    return res.status(400).json({ message: 'a non-negative threshold is required' });
  }
  if (!['superadmin', 'warehouse_admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const row = await StoreStock.findById(req.params.id);
  if (!row) return res.status(404).json({ message: 'Store stock row not found' });
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    const owns = !!wh && wh.stores.some((s) => s.toString() === row.store.toString());
    if (!owns) return res.status(403).json({ message: 'Forbidden' });
  }
  row.threshold = threshold;
  await row.save();
  res.json({ storeStock: row });
}

module.exports = { listStoreStock, adjustStoreStock, setThreshold };
```

- [ ] **Step 3: Implement `server/routes/storeStockRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listStoreStock, adjustStoreStock, setThreshold } = require('../controllers/storeStockController');

router.use(authRequired);
router.get('/', requireRole('superadmin', 'warehouse_admin', 'store_admin'), listStoreStock);
router.patch('/:id/adjust', requireRole('store_admin'), adjustStoreStock);
router.patch('/:id/threshold', requireRole('superadmin', 'warehouse_admin'), setThreshold);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/warehouse-stock', require('./routes/warehouseStockRoutes'));
app.use('/api/store-stock', require('./routes/storeStockRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- storeStock.test.js`
Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/storeStockController.js server/routes/storeStockRoutes.js server/app.js server/tests/controllers/storeStock.test.js
git commit -m "feat: add store stock endpoints (list, opname adjust, threshold)"
```

---

### Task 6: Alerts endpoint

**Files:**
- Create: `server/controllers/alertsController.js`
- Create: `server/routes/alertsRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/alerts.test.js`

**Interfaces:**
- Produces: `GET /api/alerts` (superadmin: all `StoreStock` rows where `qty < threshold`; warehouse_admin: same, filtered to their linked stores) → `200 { alerts }`, each row with `item` and `store` populated.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/alerts.test.js`. Note each `StoreStock` row needs a distinct `(store, item)` pair — the unique index from Plan 0 Task 3 rejects duplicates — so the two rows per test use two different items:

```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Store = require('../../models/Store');
const Warehouse = require('../../models/Warehouse');
const Item = require('../../models/Item');
const StoreStock = require('../../models/StoreStock');
const { signToken } = require('../../middleware/auth');

describe('GET /api/alerts', () => {
  test('superadmin sees all below-threshold rows', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const store = await Store.create({ name: 'S1', address: 'x' });
    const lowItem = await Item.create({ name: 'Low', sku: 'LOW1' });
    const okItem = await Item.create({ name: 'Ok', sku: 'OK1' });
    await StoreStock.create({ store: store._id, item: lowItem._id, qty: 2, threshold: 10 });
    await StoreStock.create({ store: store._id, item: okItem._id, qty: 20, threshold: 5 });

    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].item.name).toBe('Low');
  });

  test('warehouse_admin only sees alerts for their linked stores', async () => {
    const store1 = await Store.create({ name: 'S2', address: 'x' });
    const store2 = await Store.create({ name: 'S3', address: 'y' });
    const wh = await Warehouse.create({ name: 'WH', address: 'x', stores: [store1._id] });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const item2 = await Item.create({ name: 'C', sku: 'C1' });
    await StoreStock.create({ store: store1._id, item: item._id, qty: 1, threshold: 5 });
    await StoreStock.create({ store: store2._id, item: item2._id, qty: 1, threshold: 5 });

    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.alerts[0].store.name).toBe('S2');
  });

  test('driver cannot read alerts', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/alerts').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- alerts.test.js`
Expected: FAIL — `/api/alerts` not mounted.

- [ ] **Step 2: Implement `server/controllers/alertsController.js`**

```js
const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');

async function listAlerts(req, res) {
  let filter = {};
  if (req.user.role === 'warehouse_admin') {
    const wh = await Warehouse.findById(req.user.warehouse);
    filter = { store: { $in: wh ? wh.stores : [] } };
  }
  const rows = await StoreStock.find(filter).populate('item', 'name sku unit').populate('store', 'name address');
  const alerts = rows.filter((row) => row.qty < row.threshold);
  res.json({ alerts });
}

module.exports = { listAlerts };
```

- [ ] **Step 3: Implement `server/routes/alertsRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listAlerts } = require('../controllers/alertsController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin'), listAlerts);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/store-stock', require('./routes/storeStockRoutes'));
app.use('/api/alerts', require('./routes/alertsRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- alerts.test.js`
Expected: `3 passed`.

- [ ] **Step 6: Run the full server test suite**

Run: `npm run test:server`
Expected: all suites green (Plan 0 + Plan 1 + this plan's 6 new controller test files).

- [ ] **Step 7: Commit**

```bash
git add server/controllers/alertsController.js server/routes/alertsRoutes.js server/app.js server/tests/controllers/alerts.test.js
git commit -m "feat: add scoped low-stock alerts endpoint"
```

---

### Task 7: `MapPicker` component (click-to-set-coords)

**Files:**
- Create: `client/src/components/MapPicker.jsx`
- Test: `client/src/test/MapPicker.test.jsx`
- Modify: `client/package.json` (add `leaflet`, `react-leaflet`)

**Interfaces:**
- Produces: `<MapPicker coords={{lat,lng}|null} onChange={(coords) => void} center={[lat,lng]} zoom={number} />` — renders a Leaflet map; clicking anywhere calls `onChange({ lat, lng })`. Used by Task 9 (`WarehousesPage`) and Task 10 (`StoresPage`).

- [ ] **Step 1: Install Leaflet packages**

Run: `npm install leaflet react-leaflet --prefix client`
Expected: `client/package.json` gains `leaflet` and `react-leaflet` dependencies.

- [ ] **Step 2: Write failing test**

`client/src/test/MapPicker.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import MapPicker from '../components/MapPicker';

let capturedHandlers;

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: () => <div data-testid="marker" />,
  useMapEvents: (handlers) => {
    capturedHandlers = handlers;
    return null;
  },
}));

vi.mock('leaflet', () => ({
  default: { icon: vi.fn().mockReturnValue({}) },
}));

describe('MapPicker', () => {
  beforeEach(() => {
    capturedHandlers = undefined;
  });

  test('calls onChange with lat/lng when the map is clicked', () => {
    const onChange = vi.fn();
    render(<MapPicker coords={null} onChange={onChange} />);
    capturedHandlers.click({ latlng: { lat: -6.3, lng: 106.9 } });
    expect(onChange).toHaveBeenCalledWith({ lat: -6.3, lng: 106.9 });
  });

  test('renders no marker when coords is null', () => {
    const { queryByTestId } = render(<MapPicker coords={null} onChange={vi.fn()} />);
    expect(queryByTestId('marker')).not.toBeInTheDocument();
  });

  test('renders a marker when coords is set', () => {
    const { getByTestId } = render(<MapPicker coords={{ lat: 1, lng: 2 }} onChange={vi.fn()} />);
    expect(getByTestId('marker')).toBeInTheDocument();
  });
});
```

Run: `npm test --prefix client -- MapPicker.test.jsx`
Expected: FAIL — `Cannot find module '../components/MapPicker'`.

- [ ] **Step 3: Implement `client/src/components/MapPicker.jsx`**

```jsx
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

const markerIcon = L.icon({
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MapPicker({ coords, onChange, center = [-6.2, 106.8], zoom = 11 }) {
  return (
    <MapContainer center={coords ? [coords.lat, coords.lng] : center} zoom={zoom} style={{ height: 300, width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
      <ClickHandler onPick={onChange} />
      {coords && <Marker position={[coords.lat, coords.lng]} icon={markerIcon} />}
    </MapContainer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client -- MapPicker.test.jsx`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/MapPicker.jsx client/src/test/MapPicker.test.jsx client/package.json client/package-lock.json
git commit -m "feat: add MapPicker component for click-to-set coordinates"
```

---

### Task 8: `/admin/items` page

**Files:**
- Create: `client/src/pages/admin/ItemsPage.jsx`
- Test: `client/src/test/admin/ItemsPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `GET/POST/PATCH/DELETE /api/items` (Task 1).
- Produces: `<ItemsPage/>` — table of items + a create form (`name`, `sku`, `unit` select, `volumeM3` optional number) + a delete button per row (SweetAlert2 confirm, same pattern as Plan 1's `UsersPage`).

- [ ] **Step 1: Write failing test**

`client/src/test/admin/ItemsPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ItemsPage from '../../pages/admin/ItemsPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) } }));

describe('ItemsPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists items and creates a new one', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { items: [{ _id: '1', name: 'Indomie', sku: 'SKU1', unit: 'pcs' }] } });
    apiClient.post = vi.fn().mockResolvedValue({ data: { item: { _id: '2', name: 'Beras', sku: 'SKU2', unit: 'kg' } } });

    render(<ItemsPage />);
    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Beras' } });
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'SKU2' } });
    fireEvent.click(screen.getByRole('button', { name: /add item/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/items', { name: 'Beras', sku: 'SKU2', unit: 'pcs', volumeM3: undefined }));
  });

  test('deletes an item after confirming', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { items: [{ _id: '1', name: 'Indomie', sku: 'SKU1', unit: 'pcs' }] } });
    apiClient.delete = vi.fn().mockResolvedValue({ data: { message: 'Item deleted' } });

    render(<ItemsPage />);
    await waitFor(() => screen.getByText('Indomie'));
    fireEvent.click(screen.getByRole('button', { name: /delete indomie/i }));

    await waitFor(() => expect(apiClient.delete).toHaveBeenCalledWith('/items/1'));
  });
});
```

Run: `npm test --prefix client -- ItemsPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/admin/ItemsPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [volumeM3, setVolumeM3] = useState('');

  const load = useCallback(async () => {
    const res = await apiClient.get('/items');
    setItems(res.data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/items', {
      name,
      sku,
      unit,
      volumeM3: volumeM3 === '' ? undefined : Number(volumeM3),
    });
    setName('');
    setSku('');
    setUnit('pcs');
    setVolumeM3('');
    load();
  }

  async function handleDelete(item) {
    const result = await Swal.fire({ title: `Delete ${item.name}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
    if (result.isConfirmed) {
      await apiClient.delete(`/items/${item._id}`);
      load();
    }
  }

  return (
    <div>
      <h1>Items</h1>
      <form onSubmit={handleCreate}>
        <label htmlFor="item-name">Name</label>
        <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="item-sku">SKU</label>
        <input id="item-sku" value={sku} onChange={(e) => setSku(e.target.value)} required />

        <label htmlFor="item-unit">Unit</label>
        <select id="item-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="pcs">pcs</option>
          <option value="box">box</option>
          <option value="kg">kg</option>
        </select>

        <label htmlFor="item-volume">Volume (m³, optional)</label>
        <input id="item-volume" type="number" step="0.01" value={volumeM3} onChange={(e) => setVolumeM3(e.target.value)} />

        <button type="submit">Add item</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item._id}>
              <td>{item.name}</td>
              <td>{item.sku}</td>
              <td>{item.unit}</td>
              <td>
                <button aria-label={`Delete ${item.name}`} onClick={() => handleDelete(item)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- ItemsPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/ItemsPage.jsx client/src/test/admin/ItemsPage.test.jsx
git commit -m "feat: add /admin/items catalog CRUD page"
```

---

### Task 9: `/admin/warehouses` page

**Files:**
- Create: `client/src/pages/admin/WarehousesPage.jsx`
- Test: `client/src/test/admin/WarehousesPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `GET/POST/PATCH/DELETE /api/warehouses` (Task 3), `GET /api/stores` (Task 2, for the multiselect), `<MapPicker>` (Task 7).
- Produces: `<WarehousesPage/>` — cards showing `name`, `address`, a utilization bar (`width: ${utilizationPct}%`), and a create/edit form with `<MapPicker>` for coords and a multi-`<select>` for linked stores.

- [ ] **Step 1: Write failing test**

`client/src/test/admin/WarehousesPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WarehousesPage from '../../pages/admin/WarehousesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -6.3, lng: 106.9 })}>
      mock-map
    </button>
  ),
}));

describe('WarehousesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists warehouses with a utilization bar', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { warehouses: [{ _id: '1', name: 'WH A', address: 'x', capacityM3: 100, usedM3: 40, utilizationPct: 40, stores: [] }] } });
      }
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    render(<WarehousesPage />);
    await waitFor(() => expect(screen.getByText('WH A')).toBeInTheDocument());
    expect(screen.getByText(/40%/)).toBeInTheDocument();
  });

  test('creates a warehouse using the map picker for coords', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [] } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { warehouse: {} } });

    render(<WarehousesPage />);
    await waitFor(() => screen.getByRole('button', { name: /mock-map/i }));

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'WH B' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'Jl. X' } });
    fireEvent.click(screen.getByRole('button', { name: /mock-map/i }));
    fireEvent.click(screen.getByRole('button', { name: /create warehouse/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/warehouses', {
        name: 'WH B',
        address: 'Jl. X',
        coords: { lat: -6.3, lng: 106.9 },
        capacityM3: 0,
        areaM2: 0,
        stores: [],
      })
    );
  });
});
```

Run: `npm test --prefix client -- WarehousesPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/admin/WarehousesPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [capacityM3, setCapacityM3] = useState(0);
  const [areaM2, setAreaM2] = useState(0);
  const [selectedStores, setSelectedStores] = useState([]);

  const load = useCallback(async () => {
    const [whRes, storeRes] = await Promise.all([apiClient.get('/warehouses'), apiClient.get('/stores')]);
    setWarehouses(whRes.data.warehouses);
    setStores(storeRes.data.stores);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/warehouses', {
      name,
      address,
      coords,
      capacityM3: Number(capacityM3),
      areaM2: Number(areaM2),
      stores: selectedStores,
    });
    setName('');
    setAddress('');
    setCoords(null);
    setCapacityM3(0);
    setAreaM2(0);
    setSelectedStores([]);
    load();
  }

  function handleStoreSelect(e) {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelectedStores(values);
  }

  return (
    <div>
      <h1>Warehouses</h1>

      {warehouses.map((wh) => (
        <div key={wh._id}>
          <h2>{wh.name}</h2>
          <p>{wh.address}</p>
          <div style={{ background: '#eee', height: 8 }}>
            <div style={{ background: '#3366ff', width: `${wh.utilizationPct}%`, height: 8 }} />
          </div>
          <p>{wh.utilizationPct}% utilized</p>
        </div>
      ))}

      <form onSubmit={handleCreate}>
        <h2>New warehouse</h2>
        <label htmlFor="wh-name">Name</label>
        <input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="wh-address">Address</label>
        <input id="wh-address" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <label htmlFor="wh-capacity">Capacity (m³)</label>
        <input id="wh-capacity" type="number" value={capacityM3} onChange={(e) => setCapacityM3(e.target.value)} />

        <label htmlFor="wh-area">Area (m²)</label>
        <input id="wh-area" type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />

        <label htmlFor="wh-stores">Linked stores</label>
        <select id="wh-stores" multiple value={selectedStores} onChange={handleStoreSelect}>
          {stores.map((store) => (
            <option key={store._id} value={store._id}>
              {store.name}
            </option>
          ))}
        </select>

        <MapPicker coords={coords} onChange={setCoords} />

        <button type="submit">Create warehouse</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- WarehousesPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/WarehousesPage.jsx client/src/test/admin/WarehousesPage.test.jsx
git commit -m "feat: add /admin/warehouses page with utilization bars and map-based coords"
```

---

### Task 10: `/admin/stores` page

**Files:**
- Create: `client/src/pages/admin/StoresPage.jsx`
- Test: `client/src/test/admin/StoresPage.test.jsx`

**Interfaces:**
- Consumes: `apiClient`, `GET/POST/PATCH/DELETE /api/stores` (Task 2), `<MapPicker>` (Task 7).
- Produces: `<StoresPage/>` — same pattern as `WarehousesPage` minus utilization/stores-linkage.

- [ ] **Step 1: Write failing test**

`client/src/test/admin/StoresPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StoresPage from '../../pages/admin/StoresPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/MapPicker', () => ({
  default: ({ onChange }) => (
    <button type="button" onClick={() => onChange({ lat: -6.2, lng: 106.8 })}>
      mock-map
    </button>
  ),
}));

describe('StoresPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists stores and creates a new one via the map picker', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { stores: [{ _id: '1', name: 'Store 1', address: 'x' }] } });
    apiClient.post = vi.fn().mockResolvedValue({ data: { store: {} } });

    render(<StoresPage />);
    await waitFor(() => expect(screen.getByText('Store 1')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Store 2' } });
    fireEvent.change(screen.getByLabelText(/address/i), { target: { value: 'Jl. Y' } });
    fireEvent.click(screen.getByRole('button', { name: /mock-map/i }));
    fireEvent.click(screen.getByRole('button', { name: /create store/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/stores', { name: 'Store 2', address: 'Jl. Y', coords: { lat: -6.2, lng: 106.8 } })
    );
  });
});
```

Run: `npm test --prefix client -- StoresPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/admin/StoresPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import MapPicker from '../../components/MapPicker';

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);

  const load = useCallback(async () => {
    const res = await apiClient.get('/stores');
    setStores(res.data.stores);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    await apiClient.post('/stores', { name, address, coords });
    setName('');
    setAddress('');
    setCoords(null);
    load();
  }

  return (
    <div>
      <h1>Stores</h1>

      {stores.map((store) => (
        <div key={store._id}>
          <h2>{store.name}</h2>
          <p>{store.address}</p>
        </div>
      ))}

      <form onSubmit={handleCreate}>
        <h2>New store</h2>
        <label htmlFor="store-name">Name</label>
        <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} required />

        <label htmlFor="store-address">Address</label>
        <input id="store-address" value={address} onChange={(e) => setAddress(e.target.value)} required />

        <MapPicker coords={coords} onChange={setCoords} />

        <button type="submit">Create store</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- StoresPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/StoresPage.jsx client/src/test/admin/StoresPage.test.jsx
git commit -m "feat: add /admin/stores page"
```

---

### Task 11: `/admin/warehouse-stock` page (add-only)

**Files:**
- Create: `client/src/pages/admin/WarehouseStockPage.jsx`
- Test: `client/src/test/admin/WarehouseStockPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/warehouses`, `GET /api/items`, `POST /api/warehouse-stock/add` (Tasks 1, 3, 4).
- Produces: `<WarehouseStockPage/>` — pick a warehouse from a `<select>`, then an add-qty form (item `<select>` + qty input) that calls `POST /warehouse-stock/add`, then re-lists current stock for the picked warehouse via `GET /warehouse-stock?warehouse=`.

- [ ] **Step 1: Write failing test**

`client/src/test/admin/WarehouseStockPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WarehouseStockPage from '../../pages/admin/WarehouseStockPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('WarehouseStockPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('adds stock for the selected warehouse and item', async () => {
    apiClient.get = vi.fn((url, config) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'it1', name: 'Indomie' }] } });
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { warehouseStock: {} } });

    render(<WarehouseStockPage />);
    await waitFor(() => screen.getByLabelText(/warehouse/i));

    fireEvent.change(screen.getByLabelText(/warehouse/i), { target: { value: 'wh1' } });
    await waitFor(() => screen.getByLabelText(/^item$/i));
    fireEvent.change(screen.getByLabelText(/^item$/i), { target: { value: 'it1' } });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /add stock/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/warehouse-stock/add', { warehouse: 'wh1', item: 'it1', qty: 25 }));
  });
});
```

Run: `npm test --prefix client -- WarehouseStockPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/admin/WarehouseStockPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';

export default function WarehouseStockPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('');
  const [stock, setStock] = useState([]);

  useEffect(() => {
    Promise.all([apiClient.get('/warehouses'), apiClient.get('/items')]).then(([whRes, itemRes]) => {
      setWarehouses(whRes.data.warehouses);
      setItems(itemRes.data.items);
      if (whRes.data.warehouses.length > 0) setWarehouseId(whRes.data.warehouses[0]._id);
      if (itemRes.data.items.length > 0) setItemId(itemRes.data.items[0]._id);
    });
  }, []);

  const loadStock = useCallback(async (whId) => {
    if (!whId) {
      setStock([]);
      return;
    }
    const res = await apiClient.get('/warehouse-stock', { params: { warehouse: whId } });
    setStock(res.data.warehouseStock);
  }, []);

  useEffect(() => {
    loadStock(warehouseId);
  }, [warehouseId, loadStock]);

  async function handleAdd(e) {
    e.preventDefault();
    await apiClient.post('/warehouse-stock/add', { warehouse: warehouseId, item: itemId, qty: Number(qty) });
    setQty('');
    loadStock(warehouseId);
  }

  return (
    <div>
      <h1>Warehouse Stock</h1>

      <label htmlFor="wsp-warehouse">Warehouse</label>
      <select id="wsp-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
        {warehouses.map((wh) => (
          <option key={wh._id} value={wh._id}>
            {wh.name}
          </option>
        ))}
      </select>

      <form onSubmit={handleAdd}>
        <label htmlFor="wsp-item">Item</label>
        <select id="wsp-item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>

        <label htmlFor="wsp-qty">Quantity</label>
        <input id="wsp-qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />

        <button type="submit">Add stock</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((row) => (
            <tr key={row._id}>
              <td>{row.item?.name}</td>
              <td>{row.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- WarehouseStockPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/WarehouseStockPage.jsx client/src/test/admin/WarehouseStockPage.test.jsx
git commit -m "feat: add /admin/warehouse-stock add-only page"
```

---

### Task 12: `/warehouse/alerts` page (warehouse_admin's new landing page)

**Files:**
- Create: `client/src/pages/warehouse/AlertsPage.jsx`
- Test: `client/src/test/warehouse/AlertsPage.test.jsx`
- Modify: `client/src/components/RoleRedirect.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/alerts` (Task 6).
- Produces: `<AlertsPage/>` — red cards, one per alert row, reading `"{store.name} — {item.name}: {qty} left (threshold {threshold})"`, each with a "Pack a box for this store" button (currently a disabled/no-op placeholder — Plan 3 wires it to real box creation once `/warehouse/boxes` exists; this plan just reserves the UI affordance PRD Section 6 describes for this screen).

- [ ] **Step 1: Write failing test**

`client/src/test/warehouse/AlertsPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AlertsPage from '../../pages/warehouse/AlertsPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('AlertsPage', () => {
  test('renders one card per alert', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        alerts: [
          { _id: '1', store: { name: 'Store 1' }, item: { name: 'Item X' }, qty: 3, threshold: 10 },
        ],
      },
    });

    render(<AlertsPage />);
    await waitFor(() => expect(screen.getByText(/Store 1 — Item X: 3 left \(threshold 10\)/)).toBeInTheDocument());
  });

  test('shows a friendly message when there are no alerts', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { alerts: [] } });
    render(<AlertsPage />);
    await waitFor(() => expect(screen.getByText(/no low-stock alerts/i)).toBeInTheDocument());
  });
});
```

Run: `npm test --prefix client -- AlertsPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/warehouse/AlertsPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    apiClient.get('/alerts').then((res) => setAlerts(res.data.alerts));
  }, []);

  if (alerts === null) return <div>Loading...</div>;
  if (alerts.length === 0) return <p>No low-stock alerts right now.</p>;

  return (
    <div>
      <h1>Low Stock Alerts</h1>
      {alerts.map((alert) => (
        <div key={alert._id} style={{ background: '#fdd', padding: 8, marginBottom: 8 }}>
          <p>
            {alert.store.name} — {alert.item.name}: {alert.qty} left (threshold {alert.threshold})
          </p>
          <button disabled title="Available once box creation ships (Plan 3)">
            Pack a box for this store
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- AlertsPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Wire the route, update `ROLE_HOME`, and add a nav item**

Edit `client/src/components/RoleRedirect.jsx` — change the `warehouse_admin` entry:
```js
export const ROLE_HOME = {
  superadmin: '/admin/users',
  warehouse_admin: '/warehouse/alerts',
  store_admin: '/store',
  driver: '/driver',
  unassigned: '/pending',
};
```

Edit `client/src/components/Layout.jsx` — replace the empty `warehouse_admin` array in `NAV_ITEMS`:
```js
const NAV_ITEMS = {
  superadmin: [
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/items', label: 'Items' },
    { to: '/admin/warehouses', label: 'Warehouses' },
    { to: '/admin/stores', label: 'Stores' },
    { to: '/admin/warehouse-stock', label: 'Warehouse Stock' },
  ],
  warehouse_admin: [
    { to: '/warehouse/alerts', label: 'Alerts' },
    { to: '/warehouse/stock', label: 'Stock' },
  ],
  store_admin: [{ to: '/store/stock', label: 'Stock' }],
  driver: [{ to: '/driver', label: 'My Deliveries' }],
};
```

Edit `client/src/App.jsx` — add the new admin routes and replace the `/warehouse` placeholder route:
```jsx
import ItemsPage from './pages/admin/ItemsPage';
import WarehousesPage from './pages/admin/WarehousesPage';
import StoresPage from './pages/admin/StoresPage';
import WarehouseStockPage from './pages/admin/WarehouseStockPage';
import AlertsPage from './pages/warehouse/AlertsPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
  <Route path="/admin/users" element={<UsersPage />} />
  <Route path="/admin/items" element={<ItemsPage />} />
  <Route path="/admin/warehouses" element={<WarehousesPage />} />
  <Route path="/admin/stores" element={<StoresPage />} />
  <Route path="/admin/warehouse-stock" element={<WarehouseStockPage />} />
</Route>

<Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
  <Route path="/warehouse/alerts" element={<AlertsPage />} />
</Route>
```

Remove the old `<Route path="/warehouse" element={<RoleHomePlaceholder label="Warehouse Admin" />} />` line and its now-unused `RoleHomePlaceholder` import if `/store` and `/driver` no longer need it — they still do (Task 13/14 leave `/store` as a placeholder for now, Plan 4 replaces `/driver`), so keep the import and just drop the `/warehouse` line.

- [ ] **Step 5: Run the client test suite and manually verify**

Run: `npm run test:client`
Expected: all suites green.

Manual check: `npm run dev`, log in as a `warehouse_admin` (assign the role via `/admin/users` first) → should land on `/warehouse/alerts` and see either red alert cards or "No low-stock alerts right now."

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/warehouse/AlertsPage.jsx client/src/test/warehouse/AlertsPage.test.jsx client/src/components/RoleRedirect.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add /warehouse/alerts page as warehouse_admin's landing screen"
```

---

### Task 13: `/warehouse/stock` page

**Files:**
- Create: `client/src/pages/warehouse/StockPage.jsx`
- Test: `client/src/test/warehouse/StockPage.test.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/auth/me` (via `useAuth()`, for `user.warehouse`), `GET /api/warehouses` (Task 3, to read `stores[]` for the linked-stores tabs), `GET /api/warehouse-stock?warehouse=` (Task 4), `GET /api/store-stock?store=` and `PATCH /api/store-stock/:id/threshold` (Task 5).
- Produces: `<StockPage/>` (warehouse) — own warehouse's stock table, plus a tab per linked store showing that store's stock with an editable threshold input per row.

- [ ] **Step 1: Write failing test**

`client/src/test/warehouse/StockPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockPage from '../../pages/warehouse/StockPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');

describe('Warehouse StockPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 'u1', role: 'warehouse_admin', warehouse: 'wh1' } });
  });

  test('shows own warehouse stock and a tab per linked store', async () => {
    apiClient.get = vi.fn((url, config) => {
      if (url === '/warehouses') {
        return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A', stores: [{ _id: 'store1', name: 'Store 1' }] }] } });
      }
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [{ _id: 'ws1', item: { name: 'Indomie' }, qty: 50 }] } });
      if (url === '/store-stock') return Promise.resolve({ data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<StockPage />);

    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /store 1/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /store 1/i }));
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/store-stock', { params: { store: 'store1' } }));
  });

  test('editing a threshold PATCHes it', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [{ _id: 'wh1', name: 'WH A', stores: [{ _id: 'store1', name: 'Store 1' }] }] } });
      if (url === '/warehouse-stock') return Promise.resolve({ data: { warehouseStock: [] } });
      if (url === '/store-stock') return Promise.resolve({ data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] } });
      return Promise.reject(new Error('unexpected'));
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { storeStock: {} } });

    render(<StockPage />);
    fireEvent.click(await screen.findByRole('button', { name: /store 1/i }));
    const thresholdInput = await screen.findByLabelText(/threshold for indomie/i);
    fireEvent.change(thresholdInput, { target: { value: '15' } });
    fireEvent.blur(thresholdInput);

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/store-stock/ss1/threshold', { threshold: 15 }));
  });
});
```

Run: `npm test --prefix client -- warehouse/StockPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/warehouse/StockPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function StockPage() {
  const { user } = useAuth();
  const [linkedStores, setLinkedStores] = useState([]);
  const [warehouseStock, setWarehouseStock] = useState([]);
  const [activeStoreId, setActiveStoreId] = useState(null);
  const [storeStock, setStoreStock] = useState([]);

  useEffect(() => {
    if (!user?.warehouse) return;
    apiClient.get('/warehouses').then((res) => {
      const mine = res.data.warehouses.find((w) => w._id === user.warehouse);
      setLinkedStores(mine ? mine.stores : []);
    });
    apiClient.get('/warehouse-stock', { params: { warehouse: user.warehouse } }).then((res) => {
      setWarehouseStock(res.data.warehouseStock);
    });
  }, [user]);

  const loadStoreStock = useCallback((storeId) => {
    setActiveStoreId(storeId);
    apiClient.get('/store-stock', { params: { store: storeId } }).then((res) => setStoreStock(res.data.storeStock));
  }, []);

  async function handleThresholdChange(row, value) {
    const threshold = Number(value);
    await apiClient.patch(`/store-stock/${row._id}/threshold`, { threshold });
    loadStoreStock(activeStoreId);
  }

  return (
    <div>
      <h1>Warehouse Stock</h1>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
          </tr>
        </thead>
        <tbody>
          {warehouseStock.map((row) => (
            <tr key={row._id}>
              <td>{row.item?.name}</td>
              <td>{row.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Linked stores</h2>
      <div>
        {linkedStores.map((store) => (
          <button key={store._id} onClick={() => loadStoreStock(store._id)}>
            {store.name}
          </button>
        ))}
      </div>

      {activeStoreId && (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {storeStock.map((row) => (
              <tr key={row._id} style={row.belowThreshold ? { background: '#fdd' } : undefined}>
                <td>{row.item?.name}</td>
                <td>{row.qty}</td>
                <td>
                  <label htmlFor={`threshold-${row._id}`}>{`Threshold for ${row.item?.name}`}</label>
                  <input
                    id={`threshold-${row._id}`}
                    aria-label={`Threshold for ${row.item?.name}`}
                    type="number"
                    defaultValue={row.threshold}
                    onBlur={(e) => handleThresholdChange(row, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- warehouse/StockPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Wire the route**

Edit `client/src/App.jsx`:
```jsx
import WarehouseStockClientPage from './pages/warehouse/StockPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
  <Route path="/warehouse/alerts" element={<AlertsPage />} />
  <Route path="/warehouse/stock" element={<WarehouseStockClientPage />} />
</Route>
```

The local name `WarehouseStockClientPage` is an alias, not a requirement of the module itself (a default import can be bound to any local name) — it's used here purely so this file stays readable: `App.jsx` already has an unrelated `WarehouseStockPage` import (Task 11's superadmin page, from `./pages/admin/WarehouseStockPage`), and Task 14 below adds a third `.../StockPage.jsx` file (`./pages/store/StockPage`) imported as `StoreStockPage`. Three different files literally named `StockPage.jsx` in three role folders is intentional (mirrors the PRD's per-role screen grouping) — the aliases just keep `App.jsx`'s imports unambiguous.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/warehouse/StockPage.jsx client/src/test/warehouse/StockPage.test.jsx client/src/App.jsx
git commit -m "feat: add /warehouse/stock page with linked-store tabs and threshold editing"
```

---

### Task 14: `/store/stock` page (with opname mode)

**Files:**
- Create: `client/src/pages/store/StockPage.jsx`
- Test: `client/src/test/store/StockPage.test.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAuth()` (for `user.store`), `GET /api/store-stock?store=`, `PATCH /api/store-stock/:id/adjust` (Task 5).
- Produces: `<StockPage/>` (store) — table with a threshold badge per row (`belowThreshold` → red badge), and an "Opname mode" toggle that makes `qty` cells editable inputs; a "Save" button per row PATCHes `/adjust`.

- [ ] **Step 1: Write failing test**

`client/src/test/store/StockPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StockPage from '../../pages/store/StockPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');

describe('Store StockPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({ user: { id: 'u1', role: 'store_admin', store: 'store1' } });
  });

  test('shows stock with a below-threshold badge', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] },
    });

    render(<StockPage />);
    await waitFor(() => expect(screen.getByText('Indomie')).toBeInTheDocument());
    expect(screen.getByText(/low stock/i)).toBeInTheDocument();
  });

  test('opname mode: editing qty and saving PATCHes /adjust', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { storeStock: [{ _id: 'ss1', item: { name: 'Indomie' }, qty: 2, threshold: 10, belowThreshold: true }] },
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { storeStock: {} } });

    render(<StockPage />);
    await waitFor(() => screen.getByText('Indomie'));

    fireEvent.click(screen.getByRole('button', { name: /opname mode/i }));
    const qtyInput = screen.getByLabelText(/qty for indomie/i);
    fireEvent.change(qtyInput, { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /save indomie/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/store-stock/ss1/adjust', { qty: 8 }));
  });
});
```

Run: `npm test --prefix client -- store/StockPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/store/StockPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function StockPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [opname, setOpname] = useState(false);
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    if (!user?.store) return;
    const res = await apiClient.get('/store-stock', { params: { store: user.store } });
    setRows(res.data.storeStock);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDraftChange(rowId, value) {
    setDrafts((prev) => ({ ...prev, [rowId]: value }));
  }

  async function handleSave(row) {
    const qty = Number(drafts[row._id] ?? row.qty);
    await apiClient.patch(`/store-stock/${row._id}/adjust`, { qty });
    load();
  }

  return (
    <div>
      <h1>Store Stock</h1>
      <button onClick={() => setOpname((v) => !v)}>{opname ? 'Exit opname mode' : 'Opname mode'}</button>

      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Threshold</th>
            {opname && <th>Save</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row._id}>
              <td>
                {row.item?.name} {row.belowThreshold && <span>Low stock</span>}
              </td>
              <td>
                {opname ? (
                  <>
                    <label htmlFor={`qty-${row._id}`}>{`Qty for ${row.item?.name}`}</label>
                    <input
                      id={`qty-${row._id}`}
                      aria-label={`Qty for ${row.item?.name}`}
                      type="number"
                      defaultValue={row.qty}
                      onChange={(e) => handleDraftChange(row._id, e.target.value)}
                    />
                  </>
                ) : (
                  row.qty
                )}
              </td>
              <td>{row.threshold}</td>
              {opname && (
                <td>
                  <button aria-label={`Save ${row.item?.name}`} onClick={() => handleSave(row)}>
                    Save
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- store/StockPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Wire the route**

Edit `client/src/App.jsx`:
```jsx
import StoreStockPage from './pages/store/StockPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['store_admin']} />}>
  <Route path="/store" element={<RoleHomePlaceholder label="Store Admin" />} />
  <Route path="/store/stock" element={<StoreStockPage />} />
</Route>
```

`/store` stays the `store_admin` landing placeholder for now — Plan 3 replaces it with `/store/scan` and updates `ROLE_HOME` accordingly, same pattern as Task 12 did for `warehouse_admin`.

- [ ] **Step 5: Run full test suites**

Run: `npm run test:server && npm run test:client`
Expected: all suites green.

- [ ] **Step 6: Manual end-to-end smoke test**

Run: `npm run dev`. As superadmin: create an item, a store, and a warehouse linked to that store (using the map click to set coords for both); add warehouse stock for that item. Directly in `mongosh`, insert one `StoreStock` doc for that store/item with `qty` below `threshold` (simulating what the seed script will automate in Plan 4). Log in as a `warehouse_admin` scoped to that warehouse → confirm the alert appears on `/warehouse/alerts` and the item shows on `/warehouse/stock` under the linked store tab. Log in as the matching `store_admin` → confirm `/store/stock` shows the same row with a "Low stock" badge, and that opname mode successfully adjusts it.

Expected: all of the above works with no console errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/store/StockPage.jsx client/src/test/store/StockPage.test.jsx client/src/App.jsx
git commit -m "feat: add /store/stock page with opname mode"
```

---

## Handoff to Plans 3–4

- Backend: `authRequired`/`requireRole` scoping patterns for `warehouse_admin` (via `req.user.warehouse` + `Warehouse.stores[]`) and `store_admin` (via `req.user.store`) are now established across 6 controllers — Plan 3's box/scan endpoints reuse the same `Warehouse`/`Store` scoping checks, notably `WarehouseStock` decrement (box creation) mirrors this plan's `WarehouseStock` increment (`warehouse-stock/add`) code shape, and `StoreStock` upsert-on-delivery (box scan-in) mirrors this plan's opname `adjust` shape.
- `HandoverLog` now has two real actions in use (`WAREHOUSE_STOCK_ADDED`, `STOCK_ADJUSTED`) — Plan 3 adds `BOX_PACKED`, `DRIVER_ASSIGNED`, `PICKED_UP`, `DELIVERED` using the exact same `{ actor, action, coords?, meta }` shape.
- Frontend: `Layout`'s `NAV_ITEMS` and `RoleRedirect`'s `ROLE_HOME` were extended again in Task 12 — Plan 3 does the same for `store_admin` (`/store` → `/store/scan`) and adds warehouse box-related nav items; Plan 4 does the same for `driver`.
- The disabled "Pack a box for this store" button on `AlertsPage` (Task 12) is the integration point Plan 3 wires up once `/warehouse/boxes/new` exists — remove `disabled`/`title` and add an `onClick` navigating there, passing `alert.store._id` as the pre-selected destination.