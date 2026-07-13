# LogistiQ Plan 3: Boxes, QR & Handover (Slice C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** Plans 0–2 complete. This plan assumes `authRequired`/`requireRole`, `Layout`'s `NAV_ITEMS`, `RoleRedirect`'s `ROLE_HOME`, `apiClient`, the list-response convention, and Plan 2's `WarehouseStock`/`StoreStock` endpoints all exist as those plans left them.

**Goal:** Ship the core "money" flow of the demo — warehouse admin packs a box (decrementing warehouse stock, generating a QR), assigns it to a driver (by scanning the driver's personal QR or picking from a dropdown), the driver picks it up, and the store admin scans the box QR on arrival to auto-increment store stock and mark it delivered — with every step logged to `HandoverLog`.

**Architecture:** Five new box/scan endpoints on the backend (plus one small `drivers` lookup endpoint the assignment UI needs). Frontend adds a reusable `QrScanner` (wraps `html5-qrcode`) and `QrDisplay` (print-friendly QR image) component, then four pages: `/warehouse/boxes` (create + list), `/warehouse/assign` (scan-to-assign), `/store/scan` (scan-to-deliver), `/store/history` (delivered boxes).

**Tech Stack:** Adds `qrcode` (server, generates QR PNG data URLs) and `html5-qrcode` (client, camera-based scanning).

## Global Constraints

- QR payloads are **always** `JSON.stringify({ type: 'box'|'driver', id, token })` — never item contents. The scanner only ever reads this envelope; the server resolves what it means.
- Creating a box decrements `WarehouseStock` per line item and **rejects the whole request** (400, listing every insufficient item) if any line item doesn't have enough stock — no partial decrements.
- The store-admin box scan is one endpoint that does four things atomically in sequence: verify the box, upsert `StoreStock` per line item, mark the box `DELIVERED`, write a `HandoverLog` with coords. It accepts **either** a scanned `token` (from the QR) **or** a typed `code` (e.g. `BX-0007`) — the PRD's own risk mitigation requires a manual fallback for when the camera fails during the demo.
- **Deviation from the PRD's endpoint table, both justified by the PRD's own screen specs which the table doesn't fully support otherwise:**
  1. `GET /boxes` additionally allows `store_admin`, scoped to `destinationStore === req.user.store` — required by Screen 19 (`/store/history`), which the PRD's endpoint table role column (`wh_admin: own warehouse; driver: assigned; superadmin: all`) omits.
  2. A new `GET /api/drivers` endpoint (warehouse_admin + superadmin, returns only `{ id, name }` per driver) backs the "manual driver dropdown" fallback on `/warehouse/assign` (Screen 13) — the PRD has no endpoint for listing drivers outside the superadmin-only `/users` list, and warehouse_admin cannot call that one.
- `html5-qrcode` (camera access) needs a real browser and HTTPS or `localhost` — it cannot be exercised in jsdom. Like Plan 2's `MapPicker`, tests mock the library's exports and verify this project's wiring code (the callbacks passed to `.start()`), not the camera itself. Full manual verification (ideally over the ngrok HTTPS tunnel, per the PRD's own risk #1) happens in this plan's end-to-end steps.

---

## File Structure

```
/server
  /utils/qr.js
  /controllers/boxController.js
  /controllers/scanController.js
  /controllers/driverController.js
  /routes/boxRoutes.js
  /routes/scanRoutes.js
  /routes/driverRoutes.js
  /app.js                                   # MODIFY: mount 3 new routers
  /tests/controllers/boxes.test.js
  /tests/controllers/boxesList.test.js
  /tests/controllers/driverAssign.test.js
  /tests/controllers/pickup.test.js
  /tests/controllers/scanBox.test.js
/client
  /src/components/QrScanner.jsx
  /src/components/QrDisplay.jsx
  /src/test/QrScanner.test.jsx
  /src/test/QrDisplay.test.jsx
  /src/pages/warehouse/BoxesPage.jsx
  /src/pages/warehouse/AssignPage.jsx
  /src/pages/store/ScanPage.jsx
  /src/pages/store/HistoryPage.jsx
  /src/pages/warehouse/AlertsPage.jsx        # MODIFY: enable "Pack a box" button
  /src/components/Layout.jsx                 # MODIFY: NAV_ITEMS additions
  /src/components/RoleRedirect.jsx            # MODIFY: store_admin -> /store/scan
  /src/App.jsx                               # MODIFY: mount 4 new routes
  /src/test/warehouse/BoxesPage.test.jsx
  /src/test/warehouse/AssignPage.test.jsx
  /src/test/store/ScanPage.test.jsx
  /src/test/store/HistoryPage.test.jsx
```

---

### Task 1: QR utility + `POST /boxes` (create, decrement, log, generate QR)

**Files:**
- Create: `server/utils/qr.js`
- Create: `server/controllers/boxController.js`
- Create: `server/routes/boxRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/boxes.test.js`

**Interfaces:**
- Produces: `generateQrDataUrl(payload): Promise<string>` from `server/utils/qr.js` — `payload` is JSON-stringified then encoded as a PNG data URL via the `qrcode` package. Reused by Task 2 (regenerate) and Task 3 (this task doesn't need the driver variant, but the same helper is used for both `{type:'box',...}` and `{type:'driver',...}` payloads elsewhere).
- Produces: `nextBoxCode()` — internal helper, generates `BX-0001`-style codes from `Box.countDocuments() + 1`. Not race-safe under concurrent creation; the PRD's own risk list (Section 9) accepts this for the demo.
- Produces: `POST /api/boxes { destinationStore, items: [{item, qty}] }` (warehouse_admin only) → `201 { box, qrDataUrl }`, decrements `WarehouseStock` for the creator's warehouse, or `400 { message, errors }` listing every line item that doesn't have enough stock (no partial decrement). Writes a `BOX_PACKED` `HandoverLog`.

- [ ] **Step 1: Install `qrcode`**

Run: `npm install qrcode --prefix server`

- [ ] **Step 2: Write failing test**

`server/tests/controllers/boxes.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const WarehouseStock = require('../../models/WarehouseStock');
const Box = require('../../models/Box');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function setupWarehouseAdmin() {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
  return { wh, whAdmin, token: signToken(whAdmin) };
}

describe('POST /api/boxes', () => {
  test('creates a box, decrements warehouse stock, and logs BOX_PACKED', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S1', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 20 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({ destinationStore: store._id.toString(), items: [{ item: item._id.toString(), qty: 10 }] });

    expect(res.status).toBe(201);
    expect(res.body.box.code).toBe('BX-0001');
    expect(res.body.box.status).toBe('PACKED');
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const stockRow = await WarehouseStock.findOne({ warehouse: wh._id, item: item._id });
    expect(stockRow.qty).toBe(10);

    const logs = await HandoverLog.find({ action: 'BOX_PACKED' });
    expect(logs).toHaveLength(1);
  });

  test('rejects with no partial decrement when any line item has insufficient stock', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S2', address: 'x' });
    const okItem = await Item.create({ name: 'Ok', sku: 'OK1' });
    const shortItem = await Item.create({ name: 'Short', sku: 'SH1' });
    await WarehouseStock.create({ warehouse: wh._id, item: okItem._id, qty: 100 });
    await WarehouseStock.create({ warehouse: wh._id, item: shortItem._id, qty: 2 });

    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        destinationStore: store._id.toString(),
        items: [
          { item: okItem._id.toString(), qty: 5 },
          { item: shortItem._id.toString(), qty: 5 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);

    const okRow = await WarehouseStock.findOne({ warehouse: wh._id, item: okItem._id });
    expect(okRow.qty).toBe(100); // untouched - no partial decrement
    expect(await Box.countDocuments()).toBe(0);
  });

  test('second box in the same warehouse gets the next sequential code', async () => {
    const { wh, token } = await setupWarehouseAdmin();
    const store = await Store.create({ name: 'S3', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    await WarehouseStock.create({ warehouse: wh._id, item: item._id, qty: 100 });

    await request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send({ destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
    const res = await request(app).post('/api/boxes').set('Authorization', `Bearer ${token}`).send({ destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });

    expect(res.body.box.code).toBe('BX-0002');
  });

  test('store_admin cannot create a box', async () => {
    const store = await Store.create({ name: 'S4', address: 'x' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
    const res = await request(app)
      .post('/api/boxes')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ destinationStore: store._id, items: [] });
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- boxes.test.js`
Expected: FAIL — `/api/boxes` not mounted.

- [ ] **Step 3: Implement `server/utils/qr.js`**

```js
const QRCode = require('qrcode');

async function generateQrDataUrl(payload) {
  return QRCode.toDataURL(JSON.stringify(payload));
}

module.exports = { generateQrDataUrl };
```

- [ ] **Step 4: Implement `server/controllers/boxController.js`**

```js
const { v4: uuidv4 } = require('uuid');
const Box = require('../models/Box');
const WarehouseStock = require('../models/WarehouseStock');
const HandoverLog = require('../models/HandoverLog');
const { generateQrDataUrl } = require('../utils/qr');

async function nextBoxCode() {
  const count = await Box.countDocuments();
  return `BX-${String(count + 1).padStart(4, '0')}`;
}

async function createBox(req, res) {
  const { destinationStore, items } = req.body;
  if (!destinationStore || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'destinationStore and at least one item are required' });
  }
  const warehouseId = req.user.warehouse;
  if (!warehouseId) {
    return res.status(400).json({ message: 'You are not linked to a warehouse' });
  }

  const stockRows = await WarehouseStock.find({
    warehouse: warehouseId,
    item: { $in: items.map((line) => line.item) },
  });
  const stockByItem = new Map(stockRows.map((row) => [row.item.toString(), row.qty]));

  const errors = [];
  for (const line of items) {
    const have = stockByItem.get(line.item) || 0;
    if (have < line.qty) {
      errors.push(`Insufficient stock for item ${line.item}: have ${have}, need ${line.qty}`);
    }
  }
  if (errors.length > 0) {
    return res.status(400).json({ message: errors.join('; '), errors });
  }

  for (const line of items) {
    await WarehouseStock.updateOne({ warehouse: warehouseId, item: line.item }, { $inc: { qty: -line.qty } });
  }

  const code = await nextBoxCode();
  const qrToken = uuidv4();
  const box = await Box.create({ code, qrToken, warehouse: warehouseId, destinationStore, items });

  await HandoverLog.create({
    box: box._id,
    actor: req.user.id,
    action: 'BOX_PACKED',
    meta: { code, destinationStore, items },
  });

  const qrDataUrl = await generateQrDataUrl({ type: 'box', id: box._id.toString(), token: qrToken });

  res.status(201).json({ box, qrDataUrl });
}

module.exports = { createBox, nextBoxCode };
```

- [ ] **Step 5: Implement `server/routes/boxRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { createBox } = require('../controllers/boxController');

router.use(authRequired);
router.post('/', requireRole('warehouse_admin'), createBox);

module.exports = router;
```

- [ ] **Step 6: Mount in `server/app.js`**

```js
app.use('/api/alerts', require('./routes/alertsRoutes'));
app.use('/api/boxes', require('./routes/boxRoutes'));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test --prefix server -- boxes.test.js`
Expected: `4 passed`.

- [ ] **Step 8: Commit**

```bash
git add server/utils/qr.js server/controllers/boxController.js server/routes/boxRoutes.js server/app.js server/tests/controllers/boxes.test.js
git commit -m "feat: add box creation endpoint (decrement, QR generation, BOX_PACKED log)"
```

---

### Task 2: `GET /boxes` (scoped list) + `GET /boxes/:id/qr` (regenerate)

**Files:**
- Modify: `server/controllers/boxController.js`
- Modify: `server/routes/boxRoutes.js`
- Test: `server/tests/controllers/boxesList.test.js`

**Interfaces:**
- Produces: `GET /api/boxes?status=&search=&page=&limit=` → `200 { boxes, total, page, limit }`, `boxes[].destinationStore`/`.assignedDriver`/`.items[].item` populated. Scoping: `superadmin` all; `warehouse_admin` own warehouse; `driver` boxes with `assignedDriver === req.user.id`; `store_admin` boxes with `destinationStore === req.user.store` (the Global Constraints deviation).
- Produces: `GET /api/boxes/:id/qr` (warehouse_admin, must own the box's warehouse) → `200 { qrDataUrl }`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/boxesList.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const { signToken } = require('../../middleware/auth');

async function makeBox({ warehouse, store, status = 'PACKED', assignedDriver = null, code }) {
  const item = await Item.create({ name: `Item-${code}`, sku: `SKU-${code}` });
  return Box.create({
    code,
    qrToken: `token-${code}`,
    warehouse: warehouse._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 1 }],
    status,
    assignedDriver,
  });
}

describe('GET /api/boxes', () => {
  test('warehouse_admin only sees boxes from their warehouse', async () => {
    const wh1 = await Warehouse.create({ name: 'WH1', address: 'x' });
    const wh2 = await Warehouse.create({ name: 'WH2', address: 'y' });
    const store = await Store.create({ name: 'S', address: 'x' });
    await makeBox({ warehouse: wh1, store, code: 'BX-0001' });
    await makeBox({ warehouse: wh2, store, code: 'BX-0002' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh1._id });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0001');
  });

  test('driver only sees boxes assigned to them', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const otherDriver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    await makeBox({ warehouse: wh, store, code: 'BX-0003', status: 'ASSIGNED', assignedDriver: driver._id });
    await makeBox({ warehouse: wh, store, code: 'BX-0004', status: 'ASSIGNED', assignedDriver: otherDriver._id });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(driver)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0003');
  });

  test('store_admin only sees boxes destined for their store', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store1 = await Store.create({ name: 'S3', address: 'x' });
    const store2 = await Store.create({ name: 'S4', address: 'y' });
    const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store1._id });
    await makeBox({ warehouse: wh, store: store1, code: 'BX-0005' });
    await makeBox({ warehouse: wh, store: store2, code: 'BX-0006' });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(storeAdmin)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0005');
  });

  test('filters by status and searches by code', async () => {
    const admin = await User.create({ name: 'S', email: 's@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S5', address: 'x' });
    await makeBox({ warehouse: wh, store, code: 'BX-0007', status: 'PACKED' });
    await makeBox({ warehouse: wh, store, code: 'BX-0008', status: 'DELIVERED' });

    const res = await request(app).get('/api/boxes?status=DELIVERED&search=0008').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0008');
  });
});

describe('GET /api/boxes/:id/qr', () => {
  test('regenerates the QR for a box in the admin\'s warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH4', address: 'x' });
    const store = await Store.create({ name: 'S6', address: 'x' });
    const box = await makeBox({ warehouse: wh, store, code: 'BX-0009' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });

    const res = await request(app).get(`/api/boxes/${box._id}/qr`).set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  test('rejects a warehouse_admin from a different warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH5', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH6', address: 'y' });
    const store = await Store.create({ name: 'S7', address: 'x' });
    const box = await makeBox({ warehouse: wh, store, code: 'BX-0010' });
    const whAdmin = await User.create({ name: 'WA3', email: 'wa3@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: otherWh._id });

    const res = await request(app).get(`/api/boxes/${box._id}/qr`).set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(403);
  });
});
```

Run: `npm test --prefix server -- boxesList.test.js`
Expected: FAIL — `listBoxes`/`regenerateQr` not implemented, routes not mounted.

- [ ] **Step 2: Add `listBoxes` and `regenerateQr` to `server/controllers/boxController.js`**

Append to the file (before `module.exports`):
```js
async function listBoxes(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
  const { status, search } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (search) filter.code = new RegExp(search, 'i');

  if (req.user.role === 'warehouse_admin') {
    filter.warehouse = req.user.warehouse;
  } else if (req.user.role === 'driver') {
    filter.assignedDriver = req.user.id;
  } else if (req.user.role === 'store_admin') {
    filter.destinationStore = req.user.store;
  }

  const [boxes, total] = await Promise.all([
    Box.find(filter)
      .populate('destinationStore', 'name address')
      .populate('assignedDriver', 'name')
      .populate('items.item', 'name sku unit')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Box.countDocuments(filter),
  ]);

  res.json({ boxes, total, page, limit });
}

async function regenerateQr(req, res) {
  const box = await Box.findById(req.params.id);
  if (!box) return res.status(404).json({ message: 'Box not found' });
  if (req.user.role === 'warehouse_admin' && req.user.warehouse !== box.warehouse.toString()) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const qrDataUrl = await generateQrDataUrl({ type: 'box', id: box._id.toString(), token: box.qrToken });
  res.json({ qrDataUrl });
}
```

Update the `require` at the top of the file to also import `Box` (already imported) — no change needed there. Update `module.exports`:
```js
module.exports = { createBox, nextBoxCode, listBoxes, regenerateQr };
```

- [ ] **Step 3: Update `server/routes/boxRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { createBox, listBoxes, regenerateQr } = require('../controllers/boxController');

router.use(authRequired);
router.post('/', requireRole('warehouse_admin'), createBox);
router.get('/', requireRole('superadmin', 'warehouse_admin', 'driver', 'store_admin'), listBoxes);
router.get('/:id/qr', requireRole('warehouse_admin'), regenerateQr);

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- boxesList.test.js`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/boxController.js server/routes/boxRoutes.js server/tests/controllers/boxesList.test.js
git commit -m "feat: add scoped box listing (filter/search/paginate) and QR regeneration"
```

---

### Task 3: Driver lookup + `POST /scan/driver` + manual assign fallback

**Files:**
- Create: `server/controllers/driverController.js`
- Create: `server/routes/driverRoutes.js`
- Create: `server/controllers/scanController.js`
- Create: `server/routes/scanRoutes.js`
- Modify: `server/controllers/boxController.js` (add `assignDriverManual`)
- Modify: `server/routes/boxRoutes.js`
- Modify: `server/app.js`
- Test: `server/tests/controllers/driverAssign.test.js`

**Interfaces:**
- Produces: `GET /api/drivers` (warehouse_admin, superadmin) → `200 { drivers: [{ id, name }] }` — every `User` with `role: 'driver'`.
- Produces: `POST /api/scan/driver { token, boxIds: [id] }` (warehouse_admin) → looks up the driver by `driverQrToken === token`, verifies every `boxIds` entry belongs to the caller's warehouse and is `PACKED`, sets them all to `ASSIGNED` with `assignedDriver`, writes one `DRIVER_ASSIGNED` `HandoverLog` → `200 { message, driver }`, or `400`/`404` on mismatch.
- Produces: `POST /api/boxes/:id/assign { driverId }` (warehouse_admin) — manual fallback for the same outcome as a driver-QR scan, for a single box → `200 { box }`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/driverAssign.test.js`:
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

async function makePackedBox(wh, store, code) {
  const item = await Item.create({ name: `I-${code}`, sku: `SKU-${code}` });
  return Box.create({ code, qrToken: `t-${code}`, warehouse: wh._id, destinationStore: store._id, items: [{ item: item._id, qty: 1 }] });
}

describe('GET /api/drivers', () => {
  test('warehouse_admin lists drivers with just id and name', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const whAdmin = await User.create({ name: 'WA', email: 'wa@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'Dri', email: 'dri@example.com', passwordHash: 'x', role: 'driver' });
    await User.create({ name: 'Other', email: 'other@example.com', passwordHash: 'x', role: 'store_admin' });

    const res = await request(app).get('/api/drivers').set('Authorization', `Bearer ${signToken(whAdmin)}`);
    expect(res.status).toBe(200);
    expect(res.body.drivers).toHaveLength(1);
    expect(res.body.drivers[0]).toEqual({ id: expect.any(String), name: 'Dri' });
  });
});

describe('POST /api/scan/driver', () => {
  test('assigns all requested PACKED boxes to the scanned driver', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const whAdmin = await User.create({ name: 'WA2', email: 'wa2@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token' });
    const box1 = await makePackedBox(wh, store, 'BX-A1');
    const box2 = await makePackedBox(wh, store, 'BX-A2');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token', boxIds: [box1._id.toString(), box2._id.toString()] });

    expect(res.status).toBe(200);
    const updated1 = await Box.findById(box1._id);
    const updated2 = await Box.findById(box2._id);
    expect(updated1.status).toBe('ASSIGNED');
    expect(updated1.assignedDriver.toString()).toBe(driver._id.toString());
    expect(updated2.status).toBe('ASSIGNED');
    const logs = await HandoverLog.find({ action: 'DRIVER_ASSIGNED' });
    expect(logs).toHaveLength(1);
  });

  test('rejects an unrecognized driver token', async () => {
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const whAdmin = await User.create({ name: 'WA3', email: 'wa3@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'nope', boxIds: [] });
    expect(res.status).toBe(400);
  });

  test('rejects a box from a different warehouse', async () => {
    const wh = await Warehouse.create({ name: 'WH4', address: 'x' });
    const otherWh = await Warehouse.create({ name: 'WH5', address: 'y' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const whAdmin = await User.create({ name: 'WA4', email: 'wa4@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token-2' });
    const foreignBox = await makePackedBox(otherWh, store, 'BX-A3');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token-2', boxIds: [foreignBox._id.toString()] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/boxes/:id/assign (manual fallback)', () => {
  test('assigns a single box to a driver by id', async () => {
    const wh = await Warehouse.create({ name: 'WH6', address: 'x' });
    const store = await Store.create({ name: 'S3', address: 'x' });
    const whAdmin = await User.create({ name: 'WA5', email: 'wa5@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    const driver = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const box = await makePackedBox(wh, store, 'BX-A4');

    const res = await request(app)
      .post(`/api/boxes/${box._id}/assign`)
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ driverId: driver._id.toString() });

    expect(res.status).toBe(200);
    expect(res.body.box.status).toBe('ASSIGNED');
  });
});
```

Run: `npm test --prefix server -- driverAssign.test.js`
Expected: FAIL — endpoints not mounted.

- [ ] **Step 2: Implement `server/controllers/driverController.js`**

```js
const User = require('../models/User');

async function listDrivers(req, res) {
  const drivers = await User.find({ role: 'driver' }).select('name');
  res.json({ drivers: drivers.map((d) => ({ id: d._id.toString(), name: d.name })) });
}

module.exports = { listDrivers };
```

- [ ] **Step 3: Implement `server/routes/driverRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { listDrivers } = require('../controllers/driverController');

router.get('/', authRequired, requireRole('superadmin', 'warehouse_admin'), listDrivers);

module.exports = router;
```

- [ ] **Step 4: Implement `server/controllers/scanController.js`** (driver-assign half only — box-scan half is Task 5)

```js
const User = require('../models/User');
const Box = require('../models/Box');
const HandoverLog = require('../models/HandoverLog');

async function scanDriverAssign(req, res) {
  const { token, boxIds } = req.body;
  if (!token || !Array.isArray(boxIds) || boxIds.length === 0) {
    return res.status(400).json({ message: 'token and at least one boxId are required' });
  }
  const driver = await User.findOne({ role: 'driver', driverQrToken: token });
  if (!driver) {
    return res.status(400).json({ message: 'Driver QR not recognized' });
  }

  const boxes = await Box.find({ _id: { $in: boxIds }, warehouse: req.user.warehouse, status: 'PACKED' });
  if (boxes.length !== boxIds.length) {
    return res.status(400).json({ message: 'One or more boxes are not eligible for assignment (wrong warehouse or not PACKED)' });
  }

  await Box.updateMany({ _id: { $in: boxIds } }, { status: 'ASSIGNED', assignedDriver: driver._id });
  await HandoverLog.create({
    actor: req.user.id,
    action: 'DRIVER_ASSIGNED',
    meta: { driver: driver._id.toString(), boxIds },
  });

  res.json({ message: `${boxes.length} box(es) assigned to ${driver.name}`, driver: { id: driver._id.toString(), name: driver.name } });
}

module.exports = { scanDriverAssign };
```

- [ ] **Step 5: Implement `server/routes/scanRoutes.js`** (box-scan route added in Task 5)

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { scanDriverAssign } = require('../controllers/scanController');

router.post('/driver', authRequired, requireRole('warehouse_admin'), scanDriverAssign);

module.exports = router;
```

- [ ] **Step 6: Add `assignDriverManual` to `server/controllers/boxController.js`**

Append (needs a new import at the top of the file: `const User = require('../models/User');`):
```js
async function assignDriverManual(req, res) {
  const { driverId } = req.body;
  if (!driverId) return res.status(400).json({ message: 'driverId is required' });
  const driver = await User.findOne({ _id: driverId, role: 'driver' });
  if (!driver) return res.status(404).json({ message: 'Driver not found' });

  const box = await Box.findOne({ _id: req.params.id, warehouse: req.user.warehouse, status: 'PACKED' });
  if (!box) return res.status(400).json({ message: 'Box not found or not eligible for assignment' });

  box.status = 'ASSIGNED';
  box.assignedDriver = driver._id;
  await box.save();
  await HandoverLog.create({
    box: box._id,
    actor: req.user.id,
    action: 'DRIVER_ASSIGNED',
    meta: { driver: driver._id.toString(), boxIds: [box._id.toString()] },
  });

  res.json({ box });
}
```

Update `module.exports`:
```js
module.exports = { createBox, nextBoxCode, listBoxes, regenerateQr, assignDriverManual };
```

- [ ] **Step 7: Update `server/routes/boxRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { createBox, listBoxes, regenerateQr, assignDriverManual } = require('../controllers/boxController');

router.use(authRequired);
router.post('/', requireRole('warehouse_admin'), createBox);
router.get('/', requireRole('superadmin', 'warehouse_admin', 'driver', 'store_admin'), listBoxes);
router.get('/:id/qr', requireRole('warehouse_admin'), regenerateQr);
router.post('/:id/assign', requireRole('warehouse_admin'), assignDriverManual);

module.exports = router;
```

- [ ] **Step 8: Mount new routers in `server/app.js`**

```js
app.use('/api/boxes', require('./routes/boxRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/scan', require('./routes/scanRoutes'));
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test --prefix server -- driverAssign.test.js`
Expected: `5 passed`.

- [ ] **Step 10: Commit**

```bash
git add server/controllers/driverController.js server/routes/driverRoutes.js server/controllers/scanController.js server/routes/scanRoutes.js server/controllers/boxController.js server/routes/boxRoutes.js server/app.js server/tests/controllers/driverAssign.test.js
git commit -m "feat: add driver lookup, scan-to-assign, and manual assign fallback"
```

---

### Task 4: `PATCH /boxes/:id/pickup`

**Files:**
- Modify: `server/controllers/boxController.js`
- Modify: `server/routes/boxRoutes.js`
- Test: `server/tests/controllers/pickup.test.js`

**Interfaces:**
- Produces: `PATCH /api/boxes/:id/pickup { coords? }` (driver only, must be the box's `assignedDriver`) → `200 { box }`, sets `status: 'IN_TRANSIT'`, writes a `PICKED_UP` `HandoverLog` with `coords`.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/pickup.test.js`:
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

describe('PATCH /api/boxes/:id/pickup', () => {
  test('driver picks up their assigned box', async () => {
    const wh = await Warehouse.create({ name: 'WH', address: 'x' });
    const store = await Store.create({ name: 'S', address: 'x' });
    const item = await Item.create({ name: 'A', sku: 'A1' });
    const driver = await User.create({ name: 'D', email: 'd@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P1',
      qrToken: 't1',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'ASSIGNED',
      assignedDriver: driver._id,
    });

    const res = await request(app)
      .patch(`/api/boxes/${box._id}/pickup`)
      .set('Authorization', `Bearer ${signToken(driver)}`)
      .send({ coords: { lat: -6.2, lng: 106.8 } });

    expect(res.status).toBe(200);
    expect(res.body.box.status).toBe('IN_TRANSIT');
    const logs = await HandoverLog.find({ action: 'PICKED_UP' });
    expect(logs).toHaveLength(1);
    expect(logs[0].coords.lat).toBe(-6.2);
  });

  test('rejects a driver picking up someone else\'s box', async () => {
    const wh = await Warehouse.create({ name: 'WH2', address: 'x' });
    const store = await Store.create({ name: 'S2', address: 'x' });
    const item = await Item.create({ name: 'B', sku: 'B1' });
    const driver = await User.create({ name: 'D2', email: 'd2@example.com', passwordHash: 'x', role: 'driver' });
    const otherDriver = await User.create({ name: 'D3', email: 'd3@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P2',
      qrToken: 't2',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'ASSIGNED',
      assignedDriver: otherDriver._id,
    });

    const res = await request(app).patch(`/api/boxes/${box._id}/pickup`).set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(403);
  });

  test('rejects picking up a box that is not ASSIGNED', async () => {
    const wh = await Warehouse.create({ name: 'WH3', address: 'x' });
    const store = await Store.create({ name: 'S3', address: 'x' });
    const item = await Item.create({ name: 'C', sku: 'C1' });
    const driver = await User.create({ name: 'D4', email: 'd4@example.com', passwordHash: 'x', role: 'driver' });
    const box = await Box.create({
      code: 'BX-P3',
      qrToken: 't3',
      warehouse: wh._id,
      destinationStore: store._id,
      items: [{ item: item._id, qty: 1 }],
      status: 'PACKED',
      assignedDriver: driver._id,
    });

    const res = await request(app).patch(`/api/boxes/${box._id}/pickup`).set('Authorization', `Bearer ${signToken(driver)}`).send({});
    expect(res.status).toBe(400);
  });
});
```

Run: `npm test --prefix server -- pickup.test.js`
Expected: FAIL — route not mounted.

- [ ] **Step 2: Add `pickupBox` to `server/controllers/boxController.js`**

Append:
```js
async function pickupBox(req, res) {
  const { coords } = req.body;
  const box = await Box.findById(req.params.id);
  if (!box) return res.status(404).json({ message: 'Box not found' });
  if (!box.assignedDriver || box.assignedDriver.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (box.status !== 'ASSIGNED') {
    return res.status(400).json({ message: `Box is ${box.status}, expected ASSIGNED` });
  }
  box.status = 'IN_TRANSIT';
  await box.save();
  await HandoverLog.create({ box: box._id, actor: req.user.id, action: 'PICKED_UP', coords, meta: {} });
  res.json({ box });
}
```

Update `module.exports`:
```js
module.exports = { createBox, nextBoxCode, listBoxes, regenerateQr, assignDriverManual, pickupBox };
```

- [ ] **Step 3: Update `server/routes/boxRoutes.js`**

```js
const { createBox, listBoxes, regenerateQr, assignDriverManual, pickupBox } = require('../controllers/boxController');
```
```js
router.patch('/:id/pickup', requireRole('driver'), pickupBox);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- pickup.test.js`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/boxController.js server/routes/boxRoutes.js server/tests/controllers/pickup.test.js
git commit -m "feat: add driver pickup endpoint"
```

---

### Task 5: `POST /scan/box` — the delivery endpoint

**Files:**
- Modify: `server/controllers/scanController.js`
- Modify: `server/routes/scanRoutes.js`
- Test: `server/tests/controllers/scanBox.test.js`

**Interfaces:**
- Consumes: `StoreStock` (Plan 0/2).
- Produces: `POST /api/scan/box { token?, code?, coords? }` (store_admin) → `200 { message, items, box }` — verifies the box (by `token` from a scan, or `code` from the manual fallback), checks status is `ASSIGNED`/`IN_TRANSIT` and `destinationStore === req.user.store`, upserts `StoreStock` per line item, sets `status: 'DELIVERED'`, writes a `DELIVERED` `HandoverLog` with `coords` and item summary in `meta`. `404` invalid token/code, `400` wrong status, `403` wrong store.

- [ ] **Step 1: Write failing test**

`server/tests/controllers/scanBox.test.js`:
```js
require('../setup');
const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const Warehouse = require('../../models/Warehouse');
const Store = require('../../models/Store');
const Item = require('../../models/Item');
const Box = require('../../models/Box');
const StoreStock = require('../../models/StoreStock');
const HandoverLog = require('../../models/HandoverLog');
const { signToken } = require('../../middleware/auth');

async function setup(status = 'ASSIGNED') {
  const wh = await Warehouse.create({ name: 'WH', address: 'x' });
  const store = await Store.create({ name: 'S', address: 'x' });
  const item = await Item.create({ name: 'Indomie', sku: 'IND1' });
  const storeAdmin = await User.create({ name: 'SA', email: 'sa@example.com', passwordHash: 'x', role: 'store_admin', store: store._id });
  const box = await Box.create({
    code: 'BX-S1',
    qrToken: 'scan-token-1',
    warehouse: wh._id,
    destinationStore: store._id,
    items: [{ item: item._id, qty: 10 }],
    status,
  });
  return { wh, store, item, storeAdmin, box };
}

describe('POST /api/scan/box', () => {
  test('delivers via scanned token: upserts StoreStock, marks DELIVERED, logs', async () => {
    const { store, item, storeAdmin, box } = await setup();
    const res = await request(app)
      .post('/api/scan/box')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ token: 'scan-token-1', coords: { lat: -6.2, lng: 106.8 } });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([{ name: 'Indomie', qty: 10 }]);

    const stockRow = await StoreStock.findOne({ store: store._id, item: item._id });
    expect(stockRow.qty).toBe(10);

    const updatedBox = await Box.findById(box._id);
    expect(updatedBox.status).toBe('DELIVERED');

    const logs = await HandoverLog.find({ action: 'DELIVERED' });
    expect(logs).toHaveLength(1);
    expect(logs[0].coords.lat).toBe(-6.2);
  });

  test('delivers via manual code fallback', async () => {
    const { storeAdmin } = await setup();
    const res = await request(app)
      .post('/api/scan/box')
      .set('Authorization', `Bearer ${signToken(storeAdmin)}`)
      .send({ code: 'bx-s1' });
    expect(res.status).toBe(200);
  });

  test('increments existing StoreStock rather than overwriting', async () => {
    const { store, item, storeAdmin } = await setup();
    await StoreStock.create({ store: store._id, item: item._id, qty: 5, threshold: 3 });
    await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'scan-token-1' });
    const row = await StoreStock.findOne({ store: store._id, item: item._id });
    expect(row.qty).toBe(15);
    expect(row.threshold).toBe(3); // untouched
  });

  test('rejects wrong store', async () => {
    const { box } = await setup();
    const otherStore = await Store.create({ name: 'Other', address: 'y' });
    const otherAdmin = await User.create({ name: 'SA2', email: 'sa2@example.com', passwordHash: 'x', role: 'store_admin', store: otherStore._id });
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(otherAdmin)}`).send({ token: 'scan-token-1' });
    expect(res.status).toBe(403);
  });

  test('rejects an already-delivered box', async () => {
    const { storeAdmin } = await setup('DELIVERED');
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'scan-token-1' });
    expect(res.status).toBe(400);
  });

  test('rejects an unrecognized token', async () => {
    const { storeAdmin } = await setup();
    const res = await request(app).post('/api/scan/box').set('Authorization', `Bearer ${signToken(storeAdmin)}`).send({ token: 'nope' });
    expect(res.status).toBe(404);
  });
});
```

Run: `npm test --prefix server -- scanBox.test.js`
Expected: FAIL — `/api/scan/box` not mounted.

- [ ] **Step 2: Add `scanBox` to `server/controllers/scanController.js`**

Append (needs a new import at the top of the file: `const StoreStock = require('../models/StoreStock');`):
```js
async function scanBox(req, res) {
  const { token, code, coords } = req.body;
  if (!token && !code) {
    return res.status(400).json({ message: 'token or code is required' });
  }

  const box = token
    ? await Box.findOne({ qrToken: token }).populate('items.item', 'name sku unit')
    : await Box.findOne({ code: code.toUpperCase() }).populate('items.item', 'name sku unit');

  if (!box) {
    return res.status(404).json({ message: 'Box not found' });
  }
  if (!['ASSIGNED', 'IN_TRANSIT'].includes(box.status)) {
    return res.status(400).json({ message: `Box is already ${box.status}` });
  }
  if (box.destinationStore.toString() !== req.user.store) {
    return res.status(403).json({ message: 'This box is not destined for your store' });
  }

  for (const line of box.items) {
    await StoreStock.findOneAndUpdate(
      { store: req.user.store, item: line.item._id },
      { $inc: { qty: line.qty }, $setOnInsert: { threshold: 0 } },
      { upsert: true }
    );
  }

  box.status = 'DELIVERED';
  await box.save();

  const items = box.items.map((line) => ({ name: line.item.name, qty: line.qty }));

  await HandoverLog.create({
    box: box._id,
    actor: req.user.id,
    action: 'DELIVERED',
    coords,
    meta: { items },
  });

  res.json({ message: 'Box delivered', items, box });
}
```

Update `module.exports`:
```js
module.exports = { scanDriverAssign, scanBox };
```

- [ ] **Step 3: Update `server/routes/scanRoutes.js`**

```js
const express = require('express');
const router = express.Router();
const { authRequired, requireRole } = require('../middleware/auth');
const { scanDriverAssign, scanBox } = require('../controllers/scanController');

router.post('/driver', authRequired, requireRole('warehouse_admin'), scanDriverAssign);
router.post('/box', authRequired, requireRole('store_admin'), scanBox);

module.exports = router;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- scanBox.test.js`
Expected: `6 passed`.

- [ ] **Step 5: Run the full server test suite**

Run: `npm run test:server`
Expected: all suites green.

- [ ] **Step 6: Commit**

```bash
git add server/controllers/scanController.js server/routes/scanRoutes.js server/tests/controllers/scanBox.test.js
git commit -m "feat: add box delivery scan endpoint (the money endpoint)"
```

---

### Task 6: `QrDisplay` and `QrScanner` components

**Files:**
- Create: `client/src/components/QrDisplay.jsx`
- Create: `client/src/components/QrScanner.jsx`
- Test: `client/src/test/QrDisplay.test.jsx`
- Test: `client/src/test/QrScanner.test.jsx`
- Modify: `client/package.json` (add `html5-qrcode`)

**Interfaces:**
- Produces: `<QrDisplay dataUrl={string} label={string} />` — renders the QR PNG and a "Print" button that opens a new window with just the image and triggers `window.print()` on load.
- Produces: `<QrScanner onScan={(decodedText: string) => void} onError={(err) => void} />` — starts an `html5-qrcode` camera scan on mount using the back camera (`facingMode: 'environment'`), calls `onScan` with the raw decoded string for every successful read, stops/clears the scanner on unmount. Used by Task 9 (`AssignPage`) and Task 10 (`ScanPage`).

- [ ] **Step 1: Write failing test for `QrDisplay`**

`client/src/test/QrDisplay.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QrDisplay from '../components/QrDisplay';

describe('QrDisplay', () => {
  test('renders the QR image and opens a print window on click', () => {
    const writeMock = vi.fn();
    const openMock = vi.fn().mockReturnValue({ document: { write: writeMock } });
    vi.stubGlobal('open', openMock);

    render(<QrDisplay dataUrl="data:image/png;base64,ABC" label="Box BX-0001" />);

    expect(screen.getByAltText('Box BX-0001')).toHaveAttribute('src', 'data:image/png;base64,ABC');

    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(openMock).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,ABC'));

    vi.unstubAllGlobals();
  });
});
```

Run: `npm test --prefix client -- QrDisplay.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/components/QrDisplay.jsx`**

```jsx
export default function QrDisplay({ dataUrl, label }) {
  function handlePrint() {
    const win = window.open('', '_blank');
    win.document.write(`<img src="${dataUrl}" alt="${label}" onload="window.print()" />`);
  }

  return (
    <div>
      <img src={dataUrl} alt={label} width={200} height={200} />
      <button type="button" onClick={handlePrint}>
        Print
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- QrDisplay.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Install `html5-qrcode`**

Run: `npm install html5-qrcode --prefix client`

- [ ] **Step 5: Write failing test for `QrScanner`**

`client/src/test/QrScanner.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import QrScanner from '../components/QrScanner';

let startArgs;
const stopMock = vi.fn().mockResolvedValue(undefined);
const clearMock = vi.fn();
const startMock = vi.fn((...args) => {
  startArgs = args;
  return Promise.resolve();
});

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: startMock,
    stop: stopMock,
    clear: clearMock,
  })),
}));

describe('QrScanner', () => {
  beforeEach(() => {
    startArgs = undefined;
    vi.clearAllMocks();
  });

  test('starts the scanner with the back camera and forwards decoded text to onScan', async () => {
    const onScan = vi.fn();
    render(<QrScanner onScan={onScan} />);
    await Promise.resolve();
    await Promise.resolve();

    expect(startArgs[0]).toEqual({ facingMode: 'environment' });
    const successCallback = startArgs[2];
    successCallback('{"type":"box","id":"1","token":"tok"}');
    expect(onScan).toHaveBeenCalledWith('{"type":"box","id":"1","token":"tok"}');
  });

  test('stops and clears the scanner on unmount', async () => {
    const { unmount } = render(<QrScanner onScan={vi.fn()} />);
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(stopMock).toHaveBeenCalled();
  });
});
```

Run: `npm test --prefix client -- QrScanner.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement `client/src/components/QrScanner.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const REGION_ID = 'qr-scanner-region';

export default function QrScanner({ onScan, onError }) {
  const scannerRef = useRef(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(REGION_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => onScan(decodedText),
        () => {} // per-frame "no QR in view" callbacks are expected noise; ignore them
      )
      .catch((err) => onError?.(err));

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => scanner.clear());
    };
  }, [onScan, onError]);

  return <div id={REGION_ID} style={{ width: 300 }} />;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test --prefix client -- QrScanner.test.jsx`
Expected: `2 passed`.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/QrDisplay.jsx client/src/components/QrScanner.jsx client/src/test/QrDisplay.test.jsx client/src/test/QrScanner.test.jsx client/package.json client/package-lock.json
git commit -m "feat: add QrDisplay (print) and QrScanner (camera) components"
```

---

### Task 7: `/warehouse/boxes` page

**Files:**
- Create: `client/src/pages/warehouse/BoxesPage.jsx`
- Test: `client/src/test/warehouse/BoxesPage.test.jsx`

**Interfaces:**
- Consumes: `GET/POST /api/boxes` (Tasks 1–2), `GET /api/stores`, `GET /api/items` (Plan 2), `<QrDisplay>` (Task 6).
- Produces: `<BoxesPage/>` — status filter + code search, box table, and a create-box form (destination store select, add/remove item+qty rows) that on success shows `<QrDisplay>` for the new box.

- [ ] **Step 1: Write failing test**

`client/src/test/warehouse/BoxesPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BoxesPage from '../../pages/warehouse/BoxesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('BoxesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists boxes and creates a new one, showing its QR', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' } }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'i1', name: 'Indomie' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: { code: 'BX-0002' }, qrDataUrl: 'data:image/png;base64,XYZ' } });

    render(<BoxesPage />);
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/destination store/i), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/^item$/i), { target: { value: 'i1' } });
    fireEvent.change(screen.getByLabelText(/^qty$/i), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /create box/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/boxes', { destinationStore: 's1', items: [{ item: 'i1', qty: 5 }] })
    );
    await waitFor(() => expect(screen.getByAltText(/BX-0002/)).toBeInTheDocument());
  });

  test('filters by status', async () => {
    apiClient.get = vi.fn((url, config) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    render(<BoxesPage />);
    await waitFor(() => screen.getByLabelText(/status/i));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'DELIVERED' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } })
    );
  });
});
```

Run: `npm test --prefix client -- warehouse/BoxesPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/warehouse/BoxesPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import QrDisplay from '../../components/QrDisplay';

export default function BoxesPage() {
  const [boxes, setBoxes] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [destinationStore, setDestinationStore] = useState('');
  const [lineItem, setLineItem] = useState('');
  const [lineQty, setLineQty] = useState('');
  const [newBoxQr, setNewBoxQr] = useState(null);

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status, search, page: 1, limit: 10 } });
    setBoxes(res.data.boxes);
  }, [status, search]);

  useEffect(() => {
    loadBoxes();
  }, [loadBoxes]);

  useEffect(() => {
    apiClient.get('/stores').then((res) => setStores(res.data.stores));
    apiClient.get('/items').then((res) => setItems(res.data.items));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    const res = await apiClient.post('/boxes', {
      destinationStore,
      items: [{ item: lineItem, qty: Number(lineQty) }],
    });
    setNewBoxQr({ code: res.data.box.code, dataUrl: res.data.qrDataUrl });
    setLineItem('');
    setLineQty('');
    loadBoxes();
  }

  return (
    <div>
      <h1>Boxes</h1>

      <label htmlFor="box-status">Status</label>
      <select id="box-status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All</option>
        <option value="PACKED">PACKED</option>
        <option value="ASSIGNED">ASSIGNED</option>
        <option value="IN_TRANSIT">IN_TRANSIT</option>
        <option value="DELIVERED">DELIVERED</option>
      </select>

      <label htmlFor="box-search">Search code</label>
      <input id="box-search" value={search} onChange={(e) => setSearch(e.target.value)} />

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Destination</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box) => (
            <tr key={box._id}>
              <td>{box.code}</td>
              <td>{box.status}</td>
              <td>{box.destinationStore?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={handleCreate}>
        <h2>Create box</h2>
        <label htmlFor="box-store">Destination store</label>
        <select id="box-store" value={destinationStore} onChange={(e) => setDestinationStore(e.target.value)} required>
          <option value="">Select a store</option>
          {stores.map((store) => (
            <option key={store._id} value={store._id}>
              {store.name}
            </option>
          ))}
        </select>

        <label htmlFor="box-item">Item</label>
        <select id="box-item" value={lineItem} onChange={(e) => setLineItem(e.target.value)} required>
          <option value="">Select an item</option>
          {items.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>

        <label htmlFor="box-qty">Qty</label>
        <input id="box-qty" type="number" min="1" value={lineQty} onChange={(e) => setLineQty(e.target.value)} required />

        <button type="submit">Create box</button>
      </form>

      {newBoxQr && <QrDisplay dataUrl={newBoxQr.dataUrl} label={newBoxQr.code} />}
    </div>
  );
}
```

Note: this form ships with exactly one item+qty line for simplicity; adding a second line item to a box works fine against the API (`items` is an array) but this UI's "add another line" control is intentionally out of scope for this plan — the PRD's Screen 12 describes "line items (item + qty rows)" plural, and multi-row support is a small, low-risk UI enhancement left as a follow-up rather than blocking this plan's core money-path.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- warehouse/BoxesPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/warehouse/BoxesPage.jsx client/src/test/warehouse/BoxesPage.test.jsx
git commit -m "feat: add /warehouse/boxes page with create-box flow and QR display"
```

---

### Task 8: `/warehouse/assign` page

**Files:**
- Create: `client/src/pages/warehouse/AssignPage.jsx`
- Test: `client/src/test/warehouse/AssignPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/boxes?status=PACKED`, `GET /api/drivers`, `POST /api/scan/driver`, `POST /api/boxes/:id/assign` (Tasks 2–3), `<QrScanner>` (Task 6).
- Produces: `<AssignPage/>` — checklist of `PACKED` boxes, a `<QrScanner>` that on a decoded `{type:'driver',token}` payload calls `POST /scan/driver` with the checked box ids, and a manual driver `<select>` + "Assign selected" button fallback that calls `POST /boxes/:id/assign` once per checked box.

- [ ] **Step 1: Write failing test**

`client/src/test/warehouse/AssignPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssignPage from '../../pages/warehouse/AssignPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

let scannerOnScan;
vi.mock('../../components/QrScanner', () => ({
  default: ({ onScan }) => {
    scannerOnScan = onScan;
    return <div data-testid="scanner" />;
  },
}));

describe('AssignPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('checking boxes then scanning a driver QR assigns them', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001' }], total: 1, page: 1, limit: 10 } });
      if (url === '/drivers') return Promise.resolve({ data: { drivers: [{ id: 'd1', name: 'Dri' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'assigned', driver: { id: 'd1', name: 'Dri' } } });

    render(<AssignPage />);
    await waitFor(() => screen.getByLabelText(/bx-0001/i));

    fireEvent.click(screen.getByLabelText(/bx-0001/i));
    scannerOnScan(JSON.stringify({ type: 'driver', id: 'd1', token: 'drv-tok' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/driver', { token: 'drv-tok', boxIds: ['b1'] }));
  });

  test('manual dropdown fallback assigns checked boxes one by one', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001' }], total: 1, page: 1, limit: 10 } });
      if (url === '/drivers') return Promise.resolve({ data: { drivers: [{ id: 'd1', name: 'Dri' }] } });
      return Promise.reject(new Error('unexpected'));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: {} } });

    render(<AssignPage />);
    await waitFor(() => screen.getByLabelText(/bx-0001/i));

    fireEvent.click(screen.getByLabelText(/bx-0001/i));
    fireEvent.change(screen.getByLabelText(/manual driver/i), { target: { value: 'd1' } });
    fireEvent.click(screen.getByRole('button', { name: /assign selected/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/boxes/b1/assign', { driverId: 'd1' }));
  });
});
```

Run: `npm test --prefix client -- warehouse/AssignPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/warehouse/AssignPage.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function AssignPage() {
  const [boxes, setBoxes] = useState([]);
  const [checked, setChecked] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [manualDriverId, setManualDriverId] = useState('');
  const [message, setMessage] = useState('');

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { status: 'PACKED', search: '', page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    loadBoxes();
    apiClient.get('/drivers').then((res) => setDrivers(res.data.drivers));
  }, [loadBoxes]);

  function toggle(boxId) {
    setChecked((prev) => (prev.includes(boxId) ? prev.filter((id) => id !== boxId) : [...prev, boxId]));
  }

  async function handleDriverScan(decodedText) {
    let payload;
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setMessage('Unrecognized QR code');
      return;
    }
    if (payload.type !== 'driver') {
      setMessage('That QR is not a driver code');
      return;
    }
    const res = await apiClient.post('/scan/driver', { token: payload.token, boxIds: checked });
    setMessage(res.data.message);
    setChecked([]);
    loadBoxes();
  }

  async function handleManualAssign() {
    for (const boxId of checked) {
      await apiClient.post(`/boxes/${boxId}/assign`, { driverId: manualDriverId });
    }
    setChecked([]);
    loadBoxes();
  }

  return (
    <div>
      <h1>Assign Boxes to Driver</h1>

      <ul>
        {boxes.map((box) => (
          <li key={box._id}>
            <label>
              <input type="checkbox" aria-label={box.code} checked={checked.includes(box._id)} onChange={() => toggle(box._id)} />
              {box.code}
            </label>
          </li>
        ))}
      </ul>

      <h2>Scan driver QR</h2>
      <QrScanner onScan={handleDriverScan} onError={() => setMessage('Camera unavailable — use the manual dropdown below')} />

      <h2>Manual fallback</h2>
      <label htmlFor="manual-driver">Manual driver</label>
      <select id="manual-driver" value={manualDriverId} onChange={(e) => setManualDriverId(e.target.value)}>
        <option value="">Select a driver</option>
        {drivers.map((driver) => (
          <option key={driver.id} value={driver.id}>
            {driver.name}
          </option>
        ))}
      </select>
      <button onClick={handleManualAssign} disabled={!manualDriverId || checked.length === 0}>
        Assign selected
      </button>

      {message && <p>{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- warehouse/AssignPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/warehouse/AssignPage.jsx client/src/test/warehouse/AssignPage.test.jsx
git commit -m "feat: add /warehouse/assign page (scan-to-assign + manual fallback)"
```

---

### Task 9: `/store/scan` page (store_admin's new landing page)

**Files:**
- Create: `client/src/pages/store/ScanPage.jsx`
- Test: `client/src/test/store/ScanPage.test.jsx`
- Modify: `client/src/components/RoleRedirect.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/package.json` (add `sweetalert2` if not already present — it is, from Plan 1)

**Interfaces:**
- Consumes: `POST /api/scan/box` (Task 5), `<QrScanner>` (Task 6), `Swal` (Plan 1).
- Produces: `<ScanPage/>` — camera scanner + manual code fallback input; on success shows a SweetAlert2 listing delivered items; on error (wrong store / already delivered / invalid token) shows a SweetAlert2 error with the server's message.

- [ ] **Step 1: Write failing test**

`client/src/test/store/ScanPage.test.jsx`:
```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ScanPage from '../../pages/store/ScanPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn().mockResolvedValue({}) } }));

let scannerOnScan;
vi.mock('../../components/QrScanner', () => ({
  default: ({ onScan }) => {
    scannerOnScan = onScan;
    return <div data-testid="scanner" />;
  },
}));

describe('ScanPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('scanning a valid box QR calls /scan/box with the token', async () => {
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'Box delivered', items: [{ name: 'Indomie', qty: 10 }] } });

    render(<ScanPage />);
    scannerOnScan(JSON.stringify({ type: 'box', id: 'b1', token: 'scan-tok' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/box', { token: 'scan-tok' }));
  });

  test('manual code fallback calls /scan/box with the code', async () => {
    apiClient.post = vi.fn().mockResolvedValue({ data: { message: 'Box delivered', items: [] } });

    render(<ScanPage />);
    fireEvent.change(screen.getByLabelText(/box code/i), { target: { value: 'BX-0007' } });
    fireEvent.click(screen.getByRole('button', { name: /submit code/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/scan/box', { code: 'BX-0007' }));
  });
});
```

Run: `npm test --prefix client -- store/ScanPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/store/ScanPage.jsx`**

```jsx
import { useState } from 'react';
import Swal from 'sweetalert2';
import apiClient from '../../api/client';
import QrScanner from '../../components/QrScanner';

export default function ScanPage() {
  const [manualCode, setManualCode] = useState('');

  async function deliver(payload) {
    try {
      const res = await apiClient.post('/scan/box', payload);
      const itemsList = res.data.items.map((i) => `${i.qty}× ${i.name}`).join(', ') || 'no items';
      await Swal.fire({ icon: 'success', title: 'Box delivered', text: itemsList });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Scan failed', text: err.response?.data?.message || 'Something went wrong' });
    }
  }

  async function handleScan(decodedText) {
    let parsed;
    try {
      parsed = JSON.parse(decodedText);
    } catch {
      await Swal.fire({ icon: 'error', title: 'Unrecognized QR code' });
      return;
    }
    if (parsed.type !== 'box') {
      await Swal.fire({ icon: 'error', title: 'That QR is not a box code' });
      return;
    }
    deliver({ token: parsed.token });
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    deliver({ code: manualCode });
    setManualCode('');
  }

  return (
    <div>
      <h1>Scan Incoming Box</h1>
      <QrScanner onScan={handleScan} onError={() => {}} />

      <form onSubmit={handleManualSubmit}>
        <label htmlFor="manual-box-code">Box code (camera fallback)</label>
        <input id="manual-box-code" value={manualCode} onChange={(e) => setManualCode(e.target.value)} required />
        <button type="submit">Submit code</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- store/ScanPage.test.jsx`
Expected: `2 passed`.

- [ ] **Step 4: Wire the route, update `ROLE_HOME`, and add a nav item**

Edit `client/src/components/RoleRedirect.jsx`:
```js
export const ROLE_HOME = {
  superadmin: '/admin/users',
  warehouse_admin: '/warehouse/alerts',
  store_admin: '/store/scan',
  driver: '/driver',
  unassigned: '/pending',
};
```

Edit `client/src/components/Layout.jsx`:
```js
store_admin: [
  { to: '/store/scan', label: 'Scan' },
  { to: '/store/stock', label: 'Stock' },
],
```

Edit `client/src/App.jsx` — replace the `/store` placeholder route:
```jsx
import ScanPage from './pages/store/ScanPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['store_admin']} />}>
  <Route path="/store/scan" element={<ScanPage />} />
  <Route path="/store/stock" element={<StoreStockPage />} />
</Route>
```

Remove the old `<Route path="/store" element={<RoleHomePlaceholder label="Store Admin" />} />` line.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/store/ScanPage.jsx client/src/test/store/ScanPage.test.jsx client/src/components/RoleRedirect.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add /store/scan page as store_admin's landing screen"
```

---

### Task 10: `/store/history` page

**Files:**
- Create: `client/src/pages/store/HistoryPage.jsx`
- Test: `client/src/test/store/HistoryPage.test.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `GET /api/boxes?status=DELIVERED` (Task 2, store_admin-scoped).
- Produces: `<HistoryPage/>` — table of delivered boxes for the logged-in store admin's store (code, delivered items, driver). The "adjustment log" half of PRD Screen 19 is out of scope here — see this plan's Handoff to Plan 4 below.

- [ ] **Step 1: Write failing test**

`client/src/test/store/HistoryPage.test.jsx`:
```jsx
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import HistoryPage from '../../pages/store/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

describe('HistoryPage', () => {
  test('lists delivered boxes for the store', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: { boxes: [{ _id: 'b1', code: 'BX-0001', assignedDriver: { name: 'Dri' }, items: [{ item: { name: 'Indomie' }, qty: 10 }] }], total: 1, page: 1, limit: 10 },
    });

    render(<HistoryPage />);

    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());
    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } });
    expect(screen.getByText('Dri')).toBeInTheDocument();
  });
});
```

Run: `npm test --prefix client -- store/HistoryPage.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement `client/src/pages/store/HistoryPage.jsx`**

```jsx
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function HistoryPage() {
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    apiClient.get('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } }).then((res) => setBoxes(res.data.boxes));
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
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test --prefix client -- store/HistoryPage.test.jsx`
Expected: `1 passed`.

- [ ] **Step 4: Wire the route and nav item**

Edit `client/src/components/Layout.jsx`:
```js
store_admin: [
  { to: '/store/scan', label: 'Scan' },
  { to: '/store/stock', label: 'Stock' },
  { to: '/store/history', label: 'History' },
],
```

Edit `client/src/App.jsx`:
```jsx
import HistoryPage from './pages/store/HistoryPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['store_admin']} />}>
  <Route path="/store/scan" element={<ScanPage />} />
  <Route path="/store/stock" element={<StoreStockPage />} />
  <Route path="/store/history" element={<HistoryPage />} />
</Route>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/store/HistoryPage.jsx client/src/test/store/HistoryPage.test.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: add /store/history page (delivered boxes)"
```

---

### Task 11: Wire up the "Pack a box" button from Plan 2's `AlertsPage`, add warehouse nav items, full end-to-end test

**Files:**
- Modify: `client/src/pages/warehouse/AlertsPage.jsx`
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: `useNavigate` from `react-router-dom`, `/warehouse/boxes` (Task 7).

- [ ] **Step 1: Enable the "Pack a box for this store" button**

Edit `client/src/pages/warehouse/AlertsPage.jsx` — replace the disabled button and add navigation:
```jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(null);
  const navigate = useNavigate();

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
          <button onClick={() => navigate('/warehouse/boxes')}>Pack a box for this store</button>
        </div>
      ))}
    </div>
  );
}
```

Note: this navigates to `/warehouse/boxes` rather than pre-filling the destination store — `BoxesPage`'s create form (Task 7) doesn't currently accept a pre-selected store via route state. That's a small, self-contained UX enhancement left as a follow-up; it doesn't block the demo flow (the admin picks the store from the dropdown, which already defaults to showing every store).

- [ ] **Step 2: Add remaining warehouse_admin nav items**

Edit `client/src/components/Layout.jsx`:
```js
warehouse_admin: [
  { to: '/warehouse/alerts', label: 'Alerts' },
  { to: '/warehouse/stock', label: 'Stock' },
  { to: '/warehouse/boxes', label: 'Boxes' },
  { to: '/warehouse/assign', label: 'Assign' },
],
```

- [ ] **Step 3: Wire the remaining routes**

Edit `client/src/App.jsx`:
```jsx
import BoxesPage from './pages/warehouse/BoxesPage';
import AssignPage from './pages/warehouse/AssignPage';
```
```jsx
<Route element={<ProtectedRoute allowedRoles={['warehouse_admin']} />}>
  <Route path="/warehouse/alerts" element={<AlertsPage />} />
  <Route path="/warehouse/stock" element={<WarehouseStockClientPage />} />
  <Route path="/warehouse/boxes" element={<BoxesPage />} />
  <Route path="/warehouse/assign" element={<AssignPage />} />
</Route>
```

- [ ] **Step 4: Run the full test suites**

Run: `npm run test:server && npm run test:client`
Expected: all suites green.

- [ ] **Step 5: Manual end-to-end smoke test (the full demo money-path)**

Run: `npm run dev` (ideally also start `ngrok http 5173` and open the tunnel URL on a phone for the camera steps — the PRD flags this as the #1 risk to test early, not on demo day).

1. As superadmin: ensure a warehouse (linked to a store) has stock for an item (via `/admin/warehouse-stock`, Plan 2).
2. Create a `driver` user (via `/admin/users`) — note their assigned `driverQrToken` isn't directly visible yet (Plan 4 adds `/driver/qr`); for this manual test, read it via `mongosh` from the `users` collection.
3. As `warehouse_admin`: go to `/warehouse/boxes`, create a box for the linked store — confirm warehouse stock decrements and a QR appears.
4. Go to `/warehouse/assign`, check the new box, and either scan a QR you generate from that `driverQrToken` payload (`{"type":"driver","id":"<userId>","token":"<driverQrToken>"}`, e.g. via any QR generator) or use the manual driver dropdown — confirm the box moves to `ASSIGNED`.
5. As the `driver` (once Plan 4 ships `/driver`, `PATCH /boxes/:id/pickup` can also be exercised directly via `curl`/Postman for now) — confirm the box reaches `IN_TRANSIT`.
6. As `store_admin`: go to `/store/scan`, use the manual code fallback with the box's `code` — confirm the SweetAlert2 success dialog lists the right items, `/store/stock` reflects the new quantity, and `/store/history` shows the delivered box.

Expected: every step above completes with no console errors and the data changes described.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/warehouse/AlertsPage.jsx client/src/components/Layout.jsx client/src/App.jsx
git commit -m "feat: wire pack-a-box button and remaining warehouse nav items"
```

---

## Handoff to Plan 4

- `PATCH /boxes/:id/pickup` (Task 4) is fully built but has no UI yet — Plan 4's `/driver` page is what calls it (the "Pick up" button described in PRD Screen 15).
- `POST /driver-location` and `GET /driver-locations` (tracking) don't exist yet — Plan 4 adds them, plus the dashboard/tracking maps that plot `assignedDriver`/`DriverLocation` data this plan's boxes already carry.
- `/store/history` (Task 10) only shows delivered boxes. Once Plan 4 adds `GET /logs` (scoped so `store_admin` can read their own store's `HandoverLog` entries — the same kind of scoping extension this plan made to `GET /boxes`), extend this page to also list `STOCK_ADJUSTED` entries for the full "adjustment log" the PRD's Screen 19 describes.
- `driverQrToken` (generated in Plan 1 when a user becomes `driver`) has no display screen yet — Plan 4's `/driver/qr` is that screen; it should reuse this plan's `<QrDisplay>` component with `generateQrDataUrl({ type: 'driver', id, token: driverQrToken })` from `server/utils/qr.js`.