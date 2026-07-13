# LogistiQ Plan 4: Driver, Tracking & Dashboard (Slice D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans 0–3 complete. This is the last plan — it wires up location tracking, the superadmin dashboard, the driver's own screens, the seed script, and ngrok deploy notes, closing every loose end the earlier plans' Handoff sections left open.

**Goal:** Ship live (last-known) driver location pings and map, the superadmin dashboard (stats + map + activity feed), the driver's "My Deliveries" + personal QR screens, the demo seed script, and the two loose ends from Plan 3's handoff (`driverQrToken` exposure, `/store/history`'s adjustment log).

**Architecture:** Three new backend endpoints (`driver-location` upsert/list, `dashboard/stats`, `logs`) plus two small, explicitly-flagged edits to existing Plan 1/3 files. Frontend adds a `DashboardMap` pattern (Leaflet, same mock-based testing approach as Plan 2's `MapPicker`), a `/dashboard` page, a `/warehouse/tracking` page, and the driver's `/driver` + `/driver/qr` pages.

**Tech Stack:** No new packages — reuses `react-leaflet`/`leaflet` (Plan 2), `qrcode`/`<QrDisplay>` (Plan 3), `navigator.geolocation` (browser built-in).

## Global Constraints

- Driver location is **last-known only** — one `DriverLocation` document per driver, upserted on every ping, no history retained. This is a deliberate trade-off over a websocket-based live feed (cheaper, simpler, sufficient for "where is the driver right now" during a short demo) — be ready to explain this trade-off, per the PRD's own Q&A prep note (Section 8, item 7).
- The "delivering" toggle pings location every 30–60s while the driver's tab is open; this plan uses 45s as the concrete interval.
- **Deviation from the PRD's endpoint table, justified by Plan 3's Handoff:** `GET /logs` additionally allows `store_admin`, scoped to `actor === req.user.id` (a store_admin's own `STOCK_ADJUSTED` and `DELIVERED` actions are the only `HandoverLog` entries they can ever have created, so this scoping is exact, not approximate).
- Two small, explicitly-called-out edits to files earlier plans shipped:
  1. `authController.toPublicUser` (Plan 1) gains a `driverQrToken` field (`null` unless `role === 'driver'`) — needed for `/driver/qr` to read its own token from `/auth/me`.
  2. `boxController.listBoxes`'s `destinationStore` populate (Plan 3) grows from `'name address'` to `'name address coords'` — needed for `/driver`'s "open in map" links.

---

## File Structure

```
/server
  /controllers/driverLocationController.js
  /controllers/dashboardController.js
  /controllers/logsController.js
  /controllers/authController.js            # MODIFY: toPublicUser gains driverQrToken
  /controllers/boxController.js              # MODIFY: listBoxes populate gains coords
  /routes/driverLocationRoutes.js
  /routes/dashboardRoutes.js
  /routes/logsRoutes.js
  /app.js                                    # MODIFY: mount 3 new routers
  /seed.js
  /tests/controllers/driverLocation.test.js
  /tests/controllers/dashboard.test.js
  /tests/controllers/logs.test.js
  /tests/controllers/auth.test.js            # MODIFY: cover driverQrToken exposure
/client
  /src/components/DashboardMap.jsx
  /src/test/DashboardMap.test.jsx
  /src/pages/superadmin/DashboardPage.jsx
  /src/pages/warehouse/TrackingPage.jsx
  /src/pages/driver/DeliveriesPage.jsx
  /src/pages/driver/QrPage.jsx
  /src/pages/store/HistoryPage.jsx           # MODIFY: add adjustment log section
  /src/components/Layout.jsx                 # MODIFY: NAV_ITEMS additions
  /src/App.jsx                               # MODIFY: mount 4 new routes, replace /driver placeholder
  /src/test/superadmin/DashboardPage.test.jsx
  /src/test/warehouse/TrackingPage.test.jsx
  /src/test/driver/DeliveriesPage.test.jsx
  /src/test/driver/QrPage.test.jsx
  /src/test/store/HistoryPage.test.jsx       # MODIFY
```

---

### Task 1: Driver location — upsert + scoped list

**Files:**
- Create: `server/controllers/driverLocationController.js`
- Create: `server/routes/driverLocationRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/driverLocation.test.js`

**Interfaces:**
- Produces: `POST /api/driver-location { coords: {lat,lng} }` (driver only) → `200 { driverLocation }`, upserts the caller's single `DriverLocation` doc.
- Produces: `GET /api/driver-locations` (superadmin: all; warehouse_admin: only drivers currently `assignedDriver` on a box from their warehouse) → `200 { driverLocations }`, `driver` populated with `name`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/driverLocation.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const DriverLocation = require('../../models/DriverLocation');
const { signToken } = require('../../middleware/auth');

describe('POST /api/driver-location', () => {
  test('upserts the driver\'s own location', async () => {
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const res1 = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({ coords: { lat: 1, lng: 2 } });
    expect(res1.status).toBe(200);
    const res2 = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({ coords: { lat: 3, lng: 4 } });
    expect(res2.status).toBe(200);

    const count = await DriverLocation.countDocuments({ driver: driver._id });
    expect(count).toBe(1);
    const doc = await DriverLocation.findOne({ driver: driver._id });
    expect(doc.coords.lat).toBe(3);
  });

  test('rejects missing coords', async () => {
    const driver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).post('/api/driver-location').set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/driver-locations', () => {
  test('warehouse_admin only sees drivers assigned to boxes from their warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const driverInScope = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const driverOutOfScope = await User.create({ name: 'D4', email: 'd4@example.com', passwordHash: 'x', role: 'driver' });
    await Box.create({ code: 'BX-DL1', qrToken: 't1', warehouse: wh1._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'ASSIGNED', assignedDriver: driverInScope._id });
    await Box.create({ code: 'BX-DL2', qrToken: 't2', warehouse: wh2._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'ASSIGNED', assignedDriver: driverOutOfScope._id });
    await DriverLocation.create({ driver: driverInScope._id, coords: { lat: 1, lng: 1 } });
    await DriverLocation.create({ driver: driverOutOfScope._id, coords: { lat: 2, lng: 2 } });

    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });
    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(whAdmin)}`);

    expect(res.status).toBe(200);
    expect(res.body.driverLocations).toHaveLength(1);
    expect(res.body.driverLocations[0].driver.name).toBe('D3');
  });

  test('superadmin sees all driver locations', async () => {
    const driver = await User.create({ name: 'D5', email: 'd5@example.com', passwordHash: 'x', role: 'driver' });
    await DriverLocation.create({ driver: driver._id, coords: { lat: 1, lng: 1 } });
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });

    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.driverLocations).toHaveLength(1);
  });

  test('driver cannot list all driver locations', async () => {
    const driver = await User.create({ name: 'D6', email: 'd6@example.com', passwordHash: 'x', role: 'driver' });
    const res = await request(app).get('/api/driver-locations').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- driverLocation.test.js`
Expected: FAIL — routes not mounted.

- [ ] **Step 2: Implement `server/controllers/driverLocationController.js`**

```js
const DriverLocation = require('../models/DriverLocation');
const Box = require('../models/Box');

async function upsertLocation(req, res) {
  const { coords } = req.body;
  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return res.status(400).json({ message: 'coords: {lat, lng} is required' });
  }
  const doc = await DriverLocation.findOneAndUpdate(
    { driver: req.user.id },
    { coords, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  res.json({ driverLocation: doc });
}

async function listLocations(req, res) {
  let filter = {};
  if (req.user.role === 'warehouse_admin') {
    const boxes = await Box.find({ warehouse: req.user.warehouse, assignedDriver: { $ne: null } }).select('assignedDriver');
    const driverIds = [...new Set(boxes.map((b) => b.assignedDriver.toString()))];
    filter = { driver: { $in: driverIds } };
  }
  const rows = await DriverLocation.find(filter).populate('driver', 'name');
  res.json({ driverLocations: rows });
}

module.exports = { upsertLocation, listLocations };
```

- [ ] **Step 3: Implement `server/routes/driverLocationRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { upsertLocation, listLocations } = require('../controllers/driverLocationController');

router.post('/driver-location', authRequired, requireRole('driver'), upsertLocation);
router.get('/driver-locations', authRequired, requireRole('superadmin', 'warehouse_admin'), listLocations);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/scan', require('./routes/scanRoutes'));
app.use('/api', require('./routes/driverLocationRoutes'));
```

Note: this router is mounted at the bare `/api` prefix (not `/api/driver-location`) because it defines two sibling paths (`/driver-location` and `/driver-locations`) that aren't nested under a shared resource prefix — mounting it at `/api` and letting the router file itself declare full sub-paths keeps both PRD-specified URLs (`/api/driver-location`, `/api/driver-locations`) exactly as written in Section 4's endpoint table.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- driverLocation.test.js`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/driverLocationController.js server/routes/driverLocationRoutes.js server/app.js server/tests/controllers/driverLocation.test.js
git commit -m "feat: add driver location upsert and scoped last-known list"
```

---

### Task 2: Dashboard stats endpoint

**Files:**
- Create: `server/controllers/dashboardController.js`
- Create: `server/routes/dashboardRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/dashboard.test.js`

**Interfaces:**
- Produces: `GET /api/dashboard/stats` (superadmin only) → `200 { boxesByStatus: {PACKED,ASSIGNED,IN_TRANSIT,DELIVERED}, totalUsers, lowStockAlerts, warehouseUtilizationPct }`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/dashboard.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const WarehouseStock = require('../../models/WarehouseStock');
const StoreStock = require('../../models/StoreStock');
const { signToken } = require('../../middleware/auth');

describe('GET /api/dashboard/stats', () => {
  test('aggregates box status counts, user count, alerts, and utilization', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await User.create({ name: 'U2', email: 'u2@example.com', passwordHash: 'x', role: 'driver' });

    const wh = await Warehouse.create({ name: 'WH', address: 'x', capacityM3: 100 });
    const store = await Store.create({ name: 'S1', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1', volumeM3: 1 });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 20 });

    await Box.create({ code: 'BX-D1', qrToken: 't1', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'PACKED' });
    await Box.create({ code: 'BX-D2', qrToken: 't2', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }], status: 'DELIVERED' });

    const lowItem = await Item.create({ name: 'Low', sku: 'LOW1' });
    await StoreStock.create({ store: store._id, item: lowItem._id, qty: 1, threshold: 10 });

    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${signToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.boxesByStatus).toEqual({ PACKED: 1, ASSIGNED: 0, IN_TRANSIT: 0, DELIVERED: 1 });
    expect(res.body.totalUsers).toBe(2);
    expect(res.body.lowStockAlerts).toBe(1);
    expect(res.body.warehouseUtilizationPct).toBe(20); // 20 qty * 1 volumeM3 = 20m3 used of 100m3 capacity
  });

  test('non-superadmin cannot read dashboard stats', async () => {
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin' });
    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- dashboard.test.js`
Expected: FAIL — route not mounted.

- [ ] **Step 2: Implement `server/controllers/dashboardController.js`**

```js
const Box = require('../models/Box');
const User = require('../models/User');
const StoreStock = require('../models/StoreStock');
const Warehouse = require('../models/Warehouse');
const WarehouseStock = require('../models/WarehouseStock');

const STATUSES = ['PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED'];

async function stats(req, res) {
  const [boxesByStatusAgg, totalUsers, storeStockRows, warehouses] = await Promise.all([
    Box.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.countDocuments(),
    StoreStock.find(),
    Warehouse.find(),
  ]);

  const boxesByStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  boxesByStatusAgg.forEach((row) => {
    boxesByStatus[row._id] = row.count;
  });

  const lowStockAlerts = storeStockRows.filter((row) => row.qty < row.threshold).length;

  let totalUsedM3 = 0;
  let totalCapacityM3 = 0;
  for (const wh of warehouses) {
    const rows = await WarehouseStock.find({ warehouse: wh._id }).populate('item', 'volumeM3');
    totalUsedM3 += rows.reduce((sum, row) => sum + (row.item?.volumeM3 || 0) * row.qty, 0);
    totalCapacityM3 += wh.capacityM3 || 0;
  }
  const warehouseUtilizationPct = totalCapacityM3 > 0 ? Math.round((totalUsedM3 / totalCapacityM3) * 100) : 0;

  res.json({ boxesByStatus, totalUsers, lowStockAlerts, warehouseUtilizationPct });
}

module.exports = { stats };
```

- [ ] **Step 3: Implement `server/routes/dashboardRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { stats } = require('../controllers/dashboardController');

router.get('/stats', authRequired, requireRole('superadmin'), stats);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api', require('./routes/driverLocationRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- dashboard.test.js`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/dashboardController.js server/routes/dashboardRoutes.js server/app.js server/tests/controllers/dashboard.test.js
git commit -m "feat: add dashboard stats endpoint"
```

---

### Task 3: `GET /logs` (audit trail)

**Files:**
- Create: `server/controllers/logsController.js`
- Create: `server/routes/logsRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/logs.test.js`

**Interfaces:**
- Produces: `GET /api/logs?box=&store=&page=&limit=` → `200 { logs, total, page, limit }`, `actor` populated with `name, role`, `box` populated with `code`. Scoping: `superadmin` sees everything; `warehouse_admin` sees entries they authored OR entries whose `box` belongs to their warehouse; `store_admin` sees only entries they authored (exact scope — see Global Constraints).

- [ ] **Step 1: Write failing test**

`server/tests/controllers/logs.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

describe('GET /api/logs', () => {
  test('superadmin sees all logs', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    await HandoverLog.create({ actor: admin._id, action: 'WAREHOUSE_STOCK_ADDED', meta: {} });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {} });

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  test('store_admin only sees logs they authored', async () => {
    const store = await Store.create({ name: 'S1', address: 'x' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const otherAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin' });
    await HandoverLog.create({ actor: storeAdmin._id, action: 'STOCK_ADJUSTED', meta: { oldQty: 1, newQty: 2 } });
    await HandoverLog.create({ actor: otherAdmin._id, action: 'STOCK_ADJUSTED', meta: { oldQty: 3, newQty: 4 } });

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].meta.newQty).toBe(2);
  });

  test('warehouse_admin sees logs they authored plus logs for boxes from their warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });

    const boxInScope = await Box.create({ code: 'BX-L1', qrToken: 't1', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    const boxOutOfScope = await Box.create({ code: 'BX-L2', qrToken: 't2', warehouse: otherWh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });

    await HandoverLog.create({ box: boxInScope._id, actor: whAdmin._id, action: 'BOX_PACKED', meta: {} });
    await HandoverLog.create({ box: boxInScope._id, actor: driver._id, action: 'PICKED_UP', meta: {} }); // authored by driver, but box is in scope
    await HandoverLog.create({ box: boxOutOfScope._id, actor: driver._id, action: 'PICKED_UP', meta: {} }); // out of scope entirely

    const res = await request(app).get('/api/logs').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.body.logs).toHaveLength(2);
  });

  test('filters by box id', async () => {
    const admin = await User.create({ name: 'S3', email: 's3@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S3s', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const box = await Box.create({ code: 'BX-L3', qrToken: 't3', warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    await HandoverLog.create({ box: box._id, actor: admin._id, action: 'BOX_PACKED', meta: {} });
    await HandoverLog.create({ actor: admin._id, action: 'WAREHOUSE_STOCK_ADDED', meta: {} });

    const res = await request(app).get(`/api/logs?box=${box._id}`).set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.logs).toHaveLength(1);
  });
});
```

Run: `npm test --prefix server -- logs.test.js`
Expected: FAIL — route not mounted.

- [ ] **Step 2: Implement `server/controllers/logsController.js`**

```js
const HandoverLog = require('../models/HandoverLog');
const Box = require('../models/Box');

async function listLogs(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const { box, store } = req.query;

  let filter = {};
  if (req.user.role === 'store_admin') {
    filter = { actor: req.user.id };
  } else if (req.user.role === 'warehouse_admin') {
    const boxesInWarehouse = await Box.find({ warehouse: req.user.warehouse }).select('_id');
    filter = { $or: [{ actor: req.user.id }, { box: { $in: boxesInWarehouse.map((b) => b._id) } }] };
  }

  const extra = {};
  if (box) extra.box = box;
  if (store) {
    const boxesForStore = await Box.find({ destinationStore: store }).select('_id');
    extra.box = { $in: boxesForStore.map((b) => b._id) };
  }

  const finalFilter = Object.keys(extra).length > 0 ? { $and: [filter, extra] } : filter;

  const [logs, total] = await Promise.all([
    HandoverLog.find(finalFilter)
      .populate('actor', 'name role')
      .populate('box', 'code')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    HandoverLog.countDocuments(finalFilter),
  ]);

  res.json({ logs, total, page, limit });
}

module.exports = { listLogs };
```

- [ ] **Step 3: Implement `server/routes/logsRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listLogs } = require('../controllers/logsController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin', 'store_admin'), listLogs);

module.exports = router;
```

- [ ] **Step 4: Mount in `server/app.js`**

```js
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/logs', require('./routes/logsRoutes'));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --prefix server -- logs.test.js`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/logsController.js server/routes/logsRoutes.js server/app.js server/tests/controllers/logs.test.js
git commit -m "feat: add HandoverLog audit trail endpoint"
```

---

### Task 4: Expose `driverQrToken` via `/auth/me`

**Files:**
- Modify: `server/controllers/authController.js`
- Modify: `server/tests/controllers/auth.test.js`

**Interfaces:**
- Produces: `toPublicUser(user)` now returns `{ id, name, email, role, warehouse, store, driverQrToken }` — `driverQrToken` is `null` for every role except `driver`. This is a backward-compatible superset of Plan 1's shape (adds one field) — nothing that already destructures `{ id, name, email, role, warehouse, store }` breaks.

- [ ] **Step 1: Write failing test**

Add to `server/tests/controllers/auth.test.js` (append a new `describe` block):
```js
describe('driverQrToken exposure', () => {
  test('a driver sees their own driverQrToken via /auth/me', async () => {
    const user = await User.create({ name: 'Dri', email: 'dri2@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'abc-123' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.body.user.driverQrToken).toBe('abc-123');
  });

  test('a non-driver has a null driverQrToken', async () => {
    const user = await User.create({ name: 'Sup', email: 'sup2@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken(user)}`);
    expect(res.body.user.driverQrToken).toBeNull();
  });
});
```

This test file needs `signToken` imported — add it to the existing top-of-file requires if not already present: `const { signToken } = require('../../middleware/auth');`.

Run: `npm test --prefix server -- auth.test.js`
Expected: FAIL — `driverQrToken` is `undefined`, not `'abc-123'`/`null`.

- [ ] **Step 2: Update `toPublicUser` in `server/controllers/authController.js`**

```js
function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    warehouse: user.warehouse ? user.warehouse.toString() : null,
    store: user.store ? user.store.toString() : null,
    driverQrToken: user.role === 'driver' ? user.driverQrToken : null,
  };
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix server -- auth.test.js`
Expected: all tests in this file pass (Plan 1's original 8 + 2 new).

- [ ] **Step 4: Run the full server test suite**

Run: `npm run test:server`
Expected: all suites green — `toPublicUser` is used by `userController.js` too (Plan 1), so this confirms nothing there broke.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/authController.js server/tests/controllers/auth.test.js
git commit -m "feat: expose driverQrToken via /auth/me for the driver's own QR screen"
```

---

### Task 5: Seed script

**Files:**
- Create: `server/seed.js`

**Interfaces:**
- Produces: `npm run seed` (already wired to `node seed.js` in Plan 0's `server/package.json`) — wipes and repopulates every collection with demo data matching the PRD's Section 5 seed spec, plus deliberately under-threshold `StoreStock` for the first store so `/warehouse/alerts` has something to show immediately on login (Demo Script step 3).

- [ ] **Step 1: Implement `server/seed.js`**

```js
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
```

- [ ] **Step 2: Run it against a real database**

Run: `npm run seed` (from repo root — requires a real `MONGO_URI` in `server/.env`, same Atlas cluster the dev server uses)
Expected: console prints "Seed complete..." with the four demo account lines, and the process exits cleanly (the script closes its own connection).

- [ ] **Step 3: Verify by logging in**

Run: `npm run dev` (repo root), then in the browser log in as `superadmin@logistiq.demo` / `password123` → should land on `/admin/users` and see all four seeded accounts. Log in as `warehouse@logistiq.demo` → should land on `/warehouse/alerts` and see two red alert cards for Alfamart Sudirman.

- [ ] **Step 4: Commit**

```bash
git add server/seed.js
git commit -m "feat: add demo seed script"
```

---

### Task 6: `DashboardMap` component

**Files:**
- Create: `client/src/components/DashboardMap.jsx`
- Test: `client/src/test/DashboardMap.test.jsx`

**Interfaces:**
- Produces: `<DashboardMap warehouses={[]} stores={[]} driverLocations={[]} />` — a Leaflet map with blue warehouse markers, green store markers, and orange driver markers (popup text includes "updated N min ago"). Used by Task 7 (`DashboardPage`) and Task 8 (`TrackingPage`, warehouses/stores props omitted there).

- [ ] **Step 1: Write failing test**

`client/src/test/DashboardMap.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardMap from '../components/DashboardMap';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));
vi.mock('leaflet', () => ({
  default: { divIcon: vi.fn().mockReturnValue({}) },
}));

describe('DashboardMap', () => {
  test('renders one marker per warehouse, store, and driver location with coords', () => {
    render(
      <DashboardMap
        warehouses={[{ _id: 'w1', name: 'WH A', coords: { lat: 1, lng: 1 } }, { _id: 'w2', name: 'WH B (no coords)', coords: null }]}
        stores={[{ _id: 's1', name: 'Store 1', coords: { lat: 2, lng: 2 } }]}
        driverLocations={[{ _id: 'd1', driver: { name: 'Dri' }, coords: { lat: 3, lng: 3 }, updatedAt: new Date().toISOString() }]}
      />
    );
    expect(screen.getAllByTestId('marker')).toHaveLength(3);
    expect(screen.getByText(/dri — updated/i)).toBeInTheDocument();
  });
});
```

Run: `npm test --prefix client -- DashboardMap.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/components/DashboardMap.jsx`**

```jsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function dotIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;"></div>`,
  });
}

const warehouseIcon = dotIcon('#3366ff');
const storeIcon = dotIcon('#33aa55');
const driverIcon = dotIcon('#ff8c00');

function minutesAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(Math.round(diffMs / 60000), 0);
}

export default function DashboardMap({ warehouses = [], stores = [], driverLocations = [], center = [-6.2, 106.8], zoom = 11 }) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: 400, width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

      {warehouses
        .filter((wh) => wh.coords?.lat != null)
        .map((wh) => (
          <Marker key={wh._id} position={[wh.coords.lat, wh.coords.lng]} icon={warehouseIcon}>
            <Popup>{wh.name}</Popup>
          </Marker>
        ))}

      {stores
        .filter((store) => store.coords?.lat != null)
        .map((store) => (
          <Marker key={store._id} position={[store.coords.lat, store.coords.lng]} icon={storeIcon}>
            <Popup>{store.name}</Popup>
          </Marker>
        ))}

      {driverLocations
        .filter((dl) => dl.coords?.lat != null)
        .map((dl) => (
          <Marker key={dl._id} position={[dl.coords.lat, dl.coords.lng]} icon={driverIcon}>
            <Popup>
              {dl.driver?.name} — updated {minutesAgo(dl.updatedAt)} min ago
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- DashboardMap.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DashboardMap.jsx client/src/test/DashboardMap.test.jsx
git commit -m "feat: add DashboardMap component with warehouse/store/driver markers"
```

---

### Task 7: `/dashboard` page (superadmin)

**Files:**
- Create: `client/src/pages/superadmin/DashboardPage.jsx`
- Test: `client/src/test/superadmin/DashboardPage.test.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/components/RoleRedirect.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/dashboard/stats` (Task 2), `GET /api/warehouses`, `GET /api/stores` (Plan 2), `GET /api/driver-locations` (Task 1), `GET /api/logs` (Task 3), `<DashboardMap>` (Task 6).
- Produces: `<DashboardPage/>` — stat cards, the map, and a recent-activity feed from the last 10 log entries. Becomes superadmin's `ROLE_HOME` (was `/admin/users`).

- [ ] **Step 1: Write failing test**

`client/src/test/superadmin/DashboardPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from '../../pages/superadmin/DashboardPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/DashboardMap', () => ({ default: () => <div data-testid="map" /> }));

describe('DashboardPage', () => {
  test('renders stat cards and the recent activity feed', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/dashboard/stats') {
        return Promise.resolve({ data: { boxesByStatus: { PACKED: 2, ASSIGNED: 1, IN_TRANSIT: 0, DELIVERED: 5 }, totalUsers: 4, lowStockAlerts: 3, warehouseUtilizationPct: 42 } });
      }
      if (url === '/warehouses') return Promise.resolve({ data: { warehouses: [] } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/driver-locations') return Promise.resolve({ data: { driverLocations: [] } });
      if (url === '/logs') return Promise.resolve({ data: { logs: [{ _id: 'l1', action: 'BOX_PACKED', actor: { name: 'WA' }, box: { code: 'BX-0001' } }], total: 1, page: 1, limit: 10 } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText(/42%/)).toBeInTheDocument());
    expect(screen.getByText(/delivered: 5/i)).toBeInTheDocument();
    expect(screen.getByText(/low stock alerts: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/BOX_PACKED/)).toBeInTheDocument();
  });
});
```

Run: `npm test --prefix client -- superadmin/DashboardPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/superadmin/DashboardPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import DashboardMap from '../../components/DashboardMap';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [stores, setStores] = useState([]);
  const [driverLocations, setDriverLocations] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    apiClient.get('/dashboard/stats').then((res) => setStats(res.data));
    apiClient.get('/warehouses').then((res) => setWarehouses(res.data.warehouses));
    apiClient.get('/stores').then((res) => setStores(res.data.stores));
    apiClient.get('/driver-locations').then((res) => setDriverLocations(res.data.driverLocations));
    apiClient.get('/logs', { params: { page: 1, limit: 10 } }).then((res) => setLogs(res.data.logs));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>

      {stats && (
        <div>
          <div>Packed: {stats.boxesByStatus.PACKED}</div>
          <div>Assigned: {stats.boxesByStatus.ASSIGNED}</div>
          <div>In transit: {stats.boxesByStatus.IN_TRANSIT}</div>
          <div>Delivered: {stats.boxesByStatus.DELIVERED}</div>
          <div>Total users: {stats.totalUsers}</div>
          <div>Low stock alerts: {stats.lowStockAlerts}</div>
          <div>Warehouse utilization: {stats.warehouseUtilizationPct}%</div>
        </div>
      )}

      <DashboardMap warehouses={warehouses} stores={stores} driverLocations={driverLocations} />

      <h2>Recent activity</h2>
      <ul>
        {logs.map((log) => (
          <li key={log._id}>
            {log.action} by {log.actor?.name} {log.box ? `(box ${log.box.code})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- superadmin/DashboardPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Wire the route, update `ROLE_HOME`, add nav item**

Edit `client/src/components/RoleRedirect.jsx`:
```js
export const ROLE_HOME = {
  superadmin: '/dashboard',
  warehouse_admin: '/warehouse/alerts',
  store_admin: '/store/scan',
  driver: '/driver',
  unassigned: '/pending',
};
```

Edit `client/src/components/Layout.jsx`:
```js
superadmin: [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/items', label: 'Items' },
  { to: '/admin/warehouses', label: 'Warehouses' },
  { to: '/admin/stores', label: 'Stores' },
  { to: '/admin/warehouse-stock', label: 'Warehouse Stock' },
],
```

Edit `client/src/App.jsx`:
```jsx
import DashboardPage from './pages/superadmin/DashboardPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['superadmin']} />}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/admin/users" element={<UsersPage />} />
  <Route path="/admin/items" element={<ItemsPage />} />
  <Route path="/admin/warehouses" element={<WarehousesPage />} />
  <Route path="/admin/stores" element={<StoresPage />} />
  <Route path="/admin/warehouse-stock" element={<WarehouseStockPage />} />
</Route>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/superadmin/DashboardPage.jsx client/src/test/superadmin/DashboardPage.test.jsx client/src/components/RoleRedirect.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add superadmin /dashboard page as their new landing screen"
```

---

### Task 8: `/warehouse/tracking` page

**Files:**
- Create: `client/src/pages/warehouse/TrackingPage.jsx`
- Test: `client/src/test/warehouse/TrackingPage.test.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/driver-locations` (Task 1, already warehouse-scoped server-side), `<DashboardMap>` (Task 6, `warehouses`/`stores` props omitted).

- [ ] **Step 1: Write failing test**

`client/src/test/warehouse/TrackingPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TrackingPage from '../../pages/warehouse/TrackingPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('../../components/DashboardMap', () => ({
  default: ({ driverLocations }) => <div data-testid="map">{driverLocations.length} drivers</div>,
}));

describe('TrackingPage', () => {
  test('shows driver locations on the map', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { driverLocations: [{ _id: 'd1', driver: { name: 'Dri' }, coords: { lat: 1, lng: 1 } }] } });
    render(<TrackingPage />);
    await waitFor(() => expect(screen.getByText('1 drivers')).toBeInTheDocument());
  });
});
```

Run: `npm test --prefix client -- warehouse/TrackingPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/warehouse/TrackingPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import DashboardMap from '../../components/DashboardMap';

export default function TrackingPage() {
  const [driverLocations, setDriverLocations] = useState([]);

  useEffect(() => {
    apiClient.get('/driver-locations').then((res) => setDriverLocations(res.data.driverLocations));
  }, []);

  return (
    <div>
      <h1>Driver Tracking</h1>
      <DashboardMap driverLocations={driverLocations} />
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- warehouse/TrackingPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Wire the route and nav item**

Edit `client/src/components/Layout.jsx`:
```js
warehouse_admin: [
  { to: '/warehouse/alerts', label: 'Alerts' },
  { to: '/warehouse/stock', label: 'Stock' },
  { to: '/warehouse/boxes', label: 'Boxes' },
  { to: '/warehouse/assign', label: 'Assign' },
  { to: '/warehouse/tracking', label: 'Tracking' },
],
```

Edit `client/src/App.jsx`:
```jsx
import TrackingPage from './pages/warehouse/TrackingPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
  <Route path="/warehouse/alerts" element={<AlertsPage />} />
  <Route path="/warehouse/stock" element={<WarehouseStockClientPage />} />
  <Route path="/warehouse/boxes" element={<BoxesPage />} />
  <Route path="/warehouse/assign" element={<AssignPage />} />
  <Route path="/warehouse/tracking" element={<TrackingPage />} />
</Route>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/warehouse/TrackingPage.jsx client/src/test/warehouse/TrackingPage.test.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add /warehouse/tracking page"
```

---

### Task 9: `/driver` page — My Deliveries (driver's landing page)

**Files:**
- Create: `client/src/pages/driver/DeliveriesPage.jsx`
- Test: `client/src/test/driver/DeliveriesPage.test.jsx`
- Modify: `server/controllers/boxController.js` (populate `destinationStore` with `coords` too)
- Modify: `server/tests/controllers/boxesList.test.js` (extend one assertion)
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/boxes` (Plan 3, driver-scoped), `PATCH /api/boxes/:id/pickup` (Plan 3), `POST /api/driver-location` (Task 1), `navigator.geolocation`.
- Produces: `<DeliveriesPage/>` — boxes grouped by destination store, a badge counting `ASSIGNED`/`IN_TRANSIT` boxes (polls every 15s), a "Pick up" button per `ASSIGNED` box (sends current geolocation), and a "Start/Stop delivering" toggle that pings `/driver-location` every 45s while on.

- [ ] **Step 1: Extend the backend populate (small prerequisite edit)**

Edit `server/controllers/boxController.js`'s `listBoxes` — change:
```js
.populate('destinationStore', 'name address')
```
to:
```js
.populate('destinationStore', 'name address coords')
```

Edit `server/tests/controllers/boxesList.test.js` — in the `'store_admin only sees boxes destined for their store'` test, add one assertion after the existing ones to lock in the new field:
```js
expect(res.body.boxes[0].destinationStore).toHaveProperty('name');
```
(This is a minimal regression guard — the existing 6 tests in that file already exercise `listBoxes` end-to-end, so a full new test isn't needed for a populate-field addition.)

Run: `npm test --prefix server -- boxesList.test.js`
Expected: `6 passed` (unchanged pass count, confirms the populate change didn't break scoping).

- [ ] **Step 2: Write failing test for `DeliveriesPage`**

`client/src/test/driver/DeliveriesPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeliveriesPage from '../../pages/driver/DeliveriesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('DeliveriesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((success) => success({ coords: { latitude: -6.2, longitude: 106.8 } })),
      },
    });
  });

  test('groups boxes by destination store and shows an active-deliveries badge', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        boxes: [
          { _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Store 1', address: 'Jl. A', coords: { lat: 1, lng: 1 } } },
          { _id: 'b2', code: 'BX-0002', status: 'DELIVERED', destinationStore: { name: 'Store 1', address: 'Jl. A', coords: { lat: 1, lng: 1 } } },
        ],
        total: 2,
        page: 1,
        limit: 50,
      },
    });

    render(<DeliveriesPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(screen.getByText('Store 1')).toBeInTheDocument();
    expect(screen.getByLabelText(/active deliveries badge/i)).toHaveTextContent('1');
  });

  test('picking up a box sends geolocation coords', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Store 1', address: 'Jl. A' } }], total: 1, page: 1, limit: 50 },
    });
    apiClient.patch = vi.fn().mockResolvedValue({ data: { box: {} } });

    render(<DeliveriesPage />);
    await waitFor(() => screen.getByText('BX-0001'));
    fireEvent.click(screen.getByRole('button', { name: /pick up/i }));

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/boxes/b1/pickup', { coords: { lat: -6.2, lng: 106.8 } })
    );
  });

  test('starting delivering pings location immediately', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { boxes: [], total: 0, page: 1, limit: 50 } });
    apiClient.post = vi.fn().mockResolvedValue({ data: {} });

    render(<DeliveriesPage />);
    await waitFor(() => screen.getByRole('button', { name: /start delivering/i }));
    fireEvent.click(screen.getByRole('button', { name: /start delivering/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/driver-location', { coords: { lat: -6.2, lng: 106.8 } }));
  });
});
```

Run: `npm test --prefix client -- driver/DeliveriesPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `client/src/pages/driver/DeliveriesPage.jsx`**

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import apiClient from '../../api/client';

const PING_INTERVAL_MS = 45000;
const POLL_INTERVAL_MS = 15000;

export default function DeliveriesPage() {
  const [boxes, setBoxes] = useState([]);
  const [delivering, setDelivering] = useState(false);
  const pingIntervalRef = useRef(null);

  const load = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status: '', search: '', page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, []);

  function pingLocation() {
    navigator.geolocation.getCurrentPosition((pos) => {
      apiClient.post('/driver-location', { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
    });
  }

  function toggleDelivering() {
    setDelivering((prev) => {
      const next = !prev;
      if (next) {
        pingLocation();
        pingIntervalRef.current = setInterval(pingLocation, PING_INTERVAL_MS);
      } else if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      return next;
    });
  }

  function handlePickup(box) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await apiClient.patch(`/boxes/${box._id}/pickup`, { coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
      load();
    });
  }

  const grouped = boxes.reduce((acc, box) => {
    const key = box.destinationStore?.name || 'Unknown store';
    acc[key] = acc[key] || [];
    acc[key].push(box);
    return acc;
  }, {});

  const activeCount = boxes.filter((b) => ['ASSIGNED', 'IN_TRANSIT'].includes(b.status)).length;

  return (
    <div>
      <h1>
        My Deliveries {activeCount > 0 && <span aria-label="active deliveries badge">{activeCount}</span>}
      </h1>
      <button onClick={toggleDelivering}>{delivering ? 'Stop delivering' : 'Start delivering'}</button>

      {Object.entries(grouped).map(([storeName, storeBoxes]) => (
        <div key={storeName}>
          <h2>{storeName}</h2>
          {storeBoxes.map((box) => (
            <div key={box._id}>
              <p>
                {box.code} — {box.status}
              </p>
              {box.destinationStore?.address && (
                <p>{box.destinationStore.address}</p>
              )}
              {box.destinationStore?.coords?.lat != null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${box.destinationStore.coords.lat}&mlon=${box.destinationStore.coords.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map pin
                </a>
              )}
              {box.status === 'ASSIGNED' && <button onClick={() => handlePickup(box)}>Pick up</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client -- driver/DeliveriesPage.test.jsx`
Expected: `3 passed`.

- [ ] **Step 5: Wire the route (replace the driver placeholder)**

Edit `client/src/App.jsx`:
```jsx
import DeliveriesPage from './pages/driver/DeliveriesPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['driver']} />}>
  <Route path="/driver" element={<DeliveriesPage />} />
</Route>
```

Remove the old `<Route path="/driver" element={<RoleHomePlaceholder label="Driver" />} />` line.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/boxController.js server/tests/controllers/boxesList.test.js client/src/pages/driver/DeliveriesPage.jsx client/src/test/driver/DeliveriesPage.test.jsx client/src/App.jsx
git commit -m "feat: add /driver My Deliveries page with pickup and location pinging"
```

---

### Task 10: `/driver/qr` page

**Files:**
- Create: `client/src/pages/driver/QrPage.jsx`
- Test: `client/src/test/driver/QrPage.test.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useAuth()` (`user.driverQrToken`, `user.id` — both present after Task 4's backend change), `<QrDisplay>` (Plan 3). QR generation happens **client-side** here (unlike box QRs, which the server generates) since the payload is just the already-known `{ type: 'driver', id, token }` — no server round trip needed. Uses the browser-side `qrcode` package (same library family as the server's, different entry point) to avoid a network call for a screen that must work full-screen at a glance.

- [ ] **Step 1: Install the browser build of `qrcode`**

Run: `npm install qrcode --prefix client`

- [ ] **Step 2: Write failing test**

`client/src/test/driver/QrPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import QrPage from '../../pages/driver/QrPage';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,DRIVERQR') },
}));

describe('QrPage', () => {
  test('renders a full-screen QR built from the driver\'s own id and token', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Dri', role: 'driver', driverQrToken: 'tok-123' },
    });

    render(<QrPage />);

    await waitFor(() => expect(screen.getByAltText(/your driver qr/i)).toHaveAttribute('src', 'data:image/png;base64,DRIVERQR'));

    const QRCode = (await import('qrcode')).default;
    expect(QRCode.toDataURL).toHaveBeenCalledWith(JSON.stringify({ type: 'driver', id: 'u1', token: 'tok-123' }));
  });
});
```

Run: `npm test --prefix client -- driver/QrPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `client/src/pages/driver/QrPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../../context/AuthContext';

export default function QrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!user) return;
    QRCode.toDataURL(JSON.stringify({ type: 'driver', id: user.id, token: user.driverQrToken })).then(setDataUrl);
  }, [user]);

  if (!dataUrl) return <div>Loading...</div>;

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Your Driver QR</h1>
      <img src={dataUrl} alt="Your driver QR" width={300} height={300} />
      <p>Show this to a warehouse admin to be assigned deliveries.</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client -- driver/QrPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 5: Wire the route and nav item**

Edit `client/src/components/Layout.jsx`:
```js
driver: [
  { to: '/driver', label: 'My Deliveries' },
  { to: '/driver/qr', label: 'My QR' },
],
```

Edit `client/src/App.jsx`:
```jsx
import QrPage from './pages/driver/QrPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['driver']} />}>
  <Route path="/driver" element={<DeliveriesPage />} />
  <Route path="/driver/qr" element={<QrPage />} />
</Route>
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/driver/QrPage.jsx client/src/test/driver/QrPage.test.jsx client/src/components/Layout.jsx client/src/App.jsx client/package.json client/package-lock.json
git commit -m "feat: add /driver/qr personal QR page"
```

---

### Task 11: Finish `/store/history` — add the adjustment log

**Files:**
- Modify: `client/src/pages/store/HistoryPage.jsx`
- Modify: `client/src/test/store/HistoryPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/logs` (Task 3, `store_admin`-scoped to their own actions).
- Produces: `<HistoryPage/>` now also renders a second table of the store admin's own `STOCK_ADJUSTED` log entries (old qty → new qty, when) alongside the existing delivered-boxes table — completing PRD Screen 19 ("delivered boxes + adjustment log"), which Plan 3 explicitly deferred.

- [ ] **Step 1: Update the test**

Replace `client/src/test/store/HistoryPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoryPage from '../../pages/store/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('HistoryPage', () => {
  test('lists delivered boxes and adjustment log entries', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') {
        return Promise.resolve({
          data: { boxes: [{ _id: 'b1', code: 'BX-0001', assignedDriver: { name: 'Dri' }, items: [{ item: { name: 'Indomie' }, qty: 10 }] }], total: 1, page: 1, limit: 10 },
        });
      }
      if (url === '/logs') {
        return Promise.resolve({
          data: { logs: [{ _id: 'l1', action: 'STOCK_ADJUSTED', meta: { oldQty: 3, newQty: 9 }, timestamp: '2026-07-13T10:00:00.000Z' }], total: 1, page: 1, limit: 20 },
        });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    });

    render(<HistoryPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } });
    expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 20 } });
    expect(screen.getByText(/3 → 9/)).toBeInTheDocument();
  });
});
```

Run: `npm test --prefix client -- store/HistoryPage.test.jsx`
Expected: FAIL — current implementation doesn't call `/logs` or render an adjustment table.

- [ ] **Step 2: Update `client/src/pages/store/HistoryPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function HistoryPage() {
  const [boxes, setBoxes] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  useEffect(() => {
    apiClient.get('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } }).then((res) => setBoxes(res.data.boxes));
    apiClient.get('/logs', { params: { page: 1, limit: 20 } }).then((res) =>
      setAdjustments(res.data.logs.filter((log) => log.action === 'STOCK_ADJUSTED'))
    );
  }, []);

  return (
    <div>
      <h1>Delivery History</h1>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Items</th>
            <th>Driver</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box._id}>
              <td>{box.code}</td>
              <td>{box.items.map((line) => `${line.qty}× ${line.item?.name}`).join(', ')}</td>
              <td>{box.assignedDriver?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Opname Adjustment Log</h2>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((log) => (
            <tr key={log._id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td>
                {log.meta.oldQty} → {log.meta.newQty}
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

Run: `npm test --prefix client -- store/HistoryPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/store/HistoryPage.jsx client/src/test/store/HistoryPage.test.jsx
git commit -m "feat: add opname adjustment log to /store/history, completing Screen 19"
```

---

### Task 12: ngrok deploy notes, full test suite, full demo script rehearsal

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: none (documentation + verification only) — this task closes out the project by running everything together and rehearsing the PRD's Demo Script (Section 8) end-to-end.

- [ ] **Step 1: Add ngrok instructions to `README.md`**

Append a new section:
```markdown
## Demo deploy (ngrok)

Camera access (`getUserMedia`, used by `/warehouse/assign` and `/store/scan`) requires HTTPS on any origin that isn't `localhost` — a phone on the same network hitting your laptop's LAN IP over plain HTTP will have its camera permission silently denied. ngrok gives the client an HTTPS URL that tunnels to your local Vite dev server.

1. Run the app normally: `npm run dev` (from repo root).
2. In a separate terminal: `ngrok http 5173` (tunnels the client; the client's `VITE_API_URL` still points at your machine's `http://localhost:5000/api`, which is fine as long as the browser doing the scanning is *this* machine — for a phone, see step 3).
3. For a phone to hit the API too, tunnel the server as well: `ngrok http 5000`, then update `client/.env`'s `VITE_API_URL` to that tunnel's HTTPS URL + `/api`, and restart `npm run dev --prefix client` so Vite picks up the new env var.
4. Test the phone camera flow **at least a day before the demo**, not on demo day — this is the PRD's #1 listed risk (Section 9).
5. If the camera still fails during the actual demo: every scan screen has a manual fallback (driver dropdown on `/warehouse/assign`, box-code text input on `/store/scan`) — use it and keep going.
```

- [ ] **Step 2: Run the full test suites one final time**

Run: `npm run test:server && npm run test:client`
Expected: every suite from all 5 plans passes (Plan 0's health/model/middleware tests, Plan 1's auth/user tests, Plan 2's 6 controller test files, Plan 3's 5 controller test files, Plan 4's 4 controller test files, plus every frontend page/component test file across all plans).

- [ ] **Step 3: Rehearse the full PRD Demo Script (Section 8) end-to-end**

Run: `npm run seed` then `npm run dev`. Walk through, timing yourself:
1. Register a new user live → `/pending` → log in as superadmin, go to `/admin/users`, assign it `store_admin` (pick the third seeded store) → have that browser tab refresh → confirm it lands on `/store/scan`.
2. Superadmin `/dashboard`: confirm the map shows warehouse (blue) and store (green) markers, and stats look sane. Go to `/admin/warehouse-stock`, add stock to Warehouse Cakung for an item.
3. Log in as `warehouse@logistiq.demo` → confirm `/warehouse/alerts` shows the two seeded low-stock cards for Alfamart Sudirman → click "Pack a box for this store" → on `/warehouse/boxes`, create a box → confirm warehouse stock visibly decreases and a QR appears.
4. Go to `/warehouse/assign`, check the new box, use the manual driver dropdown (or a real phone scan of `/driver/qr` if you've got a second device handy) → confirm the box moves to `ASSIGNED`.
5. Log in as `driver@logistiq.demo` (a separate browser/incognito) → `/driver` → click "Pick up" → confirm the superadmin's `/warehouse/tracking` (or `/dashboard`) map now shows an orange driver marker.
6. Log in as `store@logistiq.demo` → `/store/scan` → use the manual box-code fallback → confirm the SweetAlert2 success dialog lists the right items, `/store/stock` reflects the new quantity with the alert cleared, and `/store/history` shows the delivered box.
7. Rehearse the Q&A talking points from Section 8, item 7 (token-only QR payloads; last-known vs. websocket tracking; Context over Redux) out loud at least once.

Expected: the entire script completes in roughly 5 minutes with no console errors, matching the PRD's target.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add ngrok deploy notes and finalize demo script rehearsal"
```

---

## Project complete

All four PRD work-split slices (Section 7: Auth/RBAC, Master Data & Stock, Boxes/QR/Handover, Driver/Tracking/Dashboard) are now implemented across Plans 0–4, each independently tested and each building working, demoable software incrementally. The PRD's rubric-exceeding checklist (Section 1) is satisfied: CRUD + protected routes on 8+ collections, bcrypt+JWT auth with 4-role RBAC, ~25 endpoints, ~19 screens, QR generation/scanning, a Leaflet map with geolocation, threshold alerts, search/filter/pagination, and SweetAlert2 — all covered somewhere in Plans 0–4's task list.