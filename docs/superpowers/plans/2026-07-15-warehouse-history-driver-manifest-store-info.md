# Warehouse Box History, Driver Manifest & Store Info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Warehouse admins can see when each box was created and browse the full event history of their boxes with a date-range filter; (2) drivers see the package codes and destinations they carry right after being scanned; (3) store admins see which store they belong to.

**Architecture:** The backend already logs every box event to `HandoverLog` and already scopes `GET /api/logs` and `GET /api/boxes` per role. We add a reusable date-range filter to both endpoints, expose the (already stored) `createdAt` on the warehouse Boxes page, add a new warehouse History page driven by `/api/logs`, extend the driver-assign scan response with box details, add a delivery manifest to the driver's "My QR" page, and surface the store admin's store (already returned by `/auth/me`) in the Layout nav.

**Tech Stack:** Node/Express/Mongoose (CommonJS) server tested with Jest + supertest (in-memory Mongo via `server/tests/setup.js`); React 18 + Vite client (ESM) tested with Vitest + React Testing Library (mocked `apiClient`).

## Global Constraints

- No new npm dependencies — everything uses libraries already in `server/package.json` and `client/package.json`.
- Server code is CommonJS (`require`/`module.exports`); client code is ESM with JSX.
- Server tests run from the `server/` directory: `npx jest tests/<path>`. Client tests run from the `client/` directory: `npx vitest run src/test/<path>`.
- All new API query params are optional — existing callers must keep working unchanged (existing tests must still pass).
- Client pages use plain `apiClient` from `client/src/api/client.js` and the existing CSS classes (`card`, `filter-bar`, `badge`, `font-mono`, `section`, etc.) — no new styling systems.
- Client tests that render components using `Link`/`useSearchParams` must wrap them in `MemoryRouter` from `react-router-dom`.
- Commit after every task with the message given in the task's final step, ending each commit message with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/utils/dateRange.js` | Create | Parse optional `from`/`to` query params into a Mongo date-range filter |
| `server/controllers/logsController.js` | Modify | Accept `from`/`to` on `GET /api/logs` (filters `timestamp`) |
| `server/controllers/boxController.js` | Modify | Accept `from`/`to` on `GET /api/boxes` (filters `createdAt`) |
| `server/controllers/scanController.js` | Modify | Return assigned box codes + destinations from `POST /api/scan/driver-assign` |
| `client/src/pages/warehouse/BoxesPage.jsx` | Modify | Show `Created` column, date-range filter, per-box History link |
| `client/src/pages/warehouse/HistoryPage.jsx` | Create | Warehouse box-event history page with date filter and optional `?box=` scoping |
| `client/src/pages/driver/DriverQrPage.jsx` | Modify | Show polling manifest of packages the driver carries (code + destination) |
| `client/src/components/Layout.jsx` | Modify | Show store name/address in nav for store admins; add warehouse History nav item |
| `client/src/App.jsx` | Modify | Register `/warehouse/history` route |
| `server/tests/controllers/logs.test.js` | Modify | Tests for logs date filter |
| `server/tests/controllers/boxesList.test.js` | Modify | Tests for boxes date filter |
| `server/tests/controllers/driverAssign.test.js` | Modify | Test for box details in scan-assign response |
| `client/src/test/warehouse/BoxesPage.test.jsx` | Modify | Update for router wrapper, Created column, date filter |
| `client/src/test/warehouse/HistoryPage.test.jsx` | Create | Tests for the new history page |
| `client/src/test/driver/DriverQrPage.test.jsx` | Create | Tests for the driver manifest |
| `client/src/test/Layout.test.jsx` | Modify | Test store info shown for store admins |

---

### Task 1: Date-range filter on `GET /api/logs`

**Files:**
- Create: `server/utils/dateRange.js`
- Modify: `server/controllers/logsController.js`
- Test: `server/tests/controllers/logs.test.js`

**Interfaces:**
- Consumes: existing `listLogs` controller and `HandoverLog` model (`timestamp: Date`).
- Produces: `buildDateRangeFilter(from, to)` in `server/utils/dateRange.js` returning `{ error: string }` on unparseable input or `{ range: { $gte?: Date, $lt?: Date } | null }` on success. `GET /api/logs` accepts optional `from` / `to` query params (any `Date`-parseable string, typically `YYYY-MM-DD`); `to` is inclusive of the whole day; invalid values return 400. Task 4's client page sends these params.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('GET /api/logs', ...)` block in `server/tests/controllers/logs.test.js` (note: `HandoverLog.timestamp` has `default: Date.now` but is a plain field, so tests can set it directly):

```js
  test('filters by from/to timestamp range, inclusive of the to day', async () => {
    const admin = await User.create({ name: 'S7', email: 's7@example.com', passwordHash: 'x', role: 'superadmin' });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-01-10T10:00:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-02-10T10:00:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-02-20T23:30:00Z') });
    await HandoverLog.create({ actor: admin._id, action: 'STOCK_ADJUSTED', meta: {}, timestamp: new Date('2026-03-10T10:00:00Z') });

    const res = await request(app)
      .get('/api/logs?from=2026-02-01&to=2026-02-20')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
  });

  test('returns 400 for an unparseable from date', async () => {
    const admin = await User.create({ name: 'S8', email: 's8@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?from=not-a-date').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  test('returns 400 for an unparseable to date', async () => {
    const admin = await User.create({ name: 'S9', email: 's9@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/logs?to=not-a-date').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

From `server/`: `npx jest tests/controllers/logs.test.js`
Expected: the three new tests FAIL (range test returns 4 logs; invalid-date tests return 200 instead of 400). The seven pre-existing tests still pass.

- [ ] **Step 3: Create the date-range util**

Create `server/utils/dateRange.js`:

```js
// Parses optional from/to query params into a Mongo date-range filter.
// `to` is treated as inclusive of the whole day, since clients send
// date-only strings (YYYY-MM-DD) that parse to midnight.
function buildDateRangeFilter(from, to) {
  const range = {};
  if (from) {
    const d = new Date(from);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid from date' };
    range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid to date' };
    range.$lt = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return { range: Object.keys(range).length > 0 ? range : null };
}

module.exports = { buildDateRangeFilter };
```

- [ ] **Step 4: Wire it into `listLogs`**

In `server/controllers/logsController.js`, add the require below the existing ones (line 3):

```js
const { buildDateRangeFilter } = require('../utils/dateRange');
```

Change the query destructure (currently `const { box, store } = req.query;`) to:

```js
  const { box, store, from, to } = req.query;
```

Directly after the existing `store` ObjectId validation block, add:

```js
  const { range, error } = buildDateRangeFilter(from, to);
  if (error) {
    return res.status(400).json({ message: error });
  }
```

In the `extra` filter section (after `if (store) { ... }`), add:

```js
  if (range) extra.timestamp = range;
```

- [ ] **Step 5: Run tests to verify they pass**

From `server/`: `npx jest tests/controllers/logs.test.js`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add server/utils/dateRange.js server/controllers/logsController.js server/tests/controllers/logs.test.js
git commit -m "feat(server): add from/to date filter to GET /api/logs"
```

---

### Task 2: Date-range filter on `GET /api/boxes`

**Files:**
- Modify: `server/controllers/boxController.js` (the `listBoxes` function, lines 78-108)
- Test: `server/tests/controllers/boxesList.test.js`

**Interfaces:**
- Consumes: `buildDateRangeFilter(from, to)` from `server/utils/dateRange.js` (Task 1) — returns `{ error }` or `{ range }`.
- Produces: `GET /api/boxes` accepts optional `from` / `to` query params filtering on `createdAt` (400 on unparseable values). Task 3's client page sends these params. Boxes already include `createdAt` in responses (schema has `timestamps: true`) — no serialization change needed.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('GET /api/boxes', ...)` block in `server/tests/controllers/boxesList.test.js`. Because `timestamps: true` makes Mongoose control `createdAt`, the test backdates via the raw driver collection:

```js
  test('filters by from/to createdAt range', async () => {
    const admin = await User.create({ name: 'SD', email: 'sd@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WHD', address: 'x' });
    const store = await Store.create({ name: 'SD1', address: 'x' });
    const oldBox = await makeBox({ warehouse: wh, store, code: 'BX-0100' });
    const newBox = await makeBox({ warehouse: wh, store, code: 'BX-0101' });
    await Box.collection.updateOne({ _id: oldBox._id }, { $set: { createdAt: new Date('2026-01-05T10:00:00Z') } });
    await Box.collection.updateOne({ _id: newBox._id }, { $set: { createdAt: new Date('2026-03-05T10:00:00Z') } });

    const res = await request(app)
      .get('/api/boxes?from=2026-02-01&to=2026-03-31')
      .set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(200);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].code).toBe('BX-0101');
  });

  test('returns 400 for an unparseable date param', async () => {
    const admin = await User.create({ name: 'SD2', email: 'sd2@example.com', passwordHash: 'x', role: 'superadmin' });
    const res = await request(app).get('/api/boxes?from=garbage').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.status).toBe(400);
  });

  test('boxes include their createdAt', async () => {
    const admin = await User.create({ name: 'SD3', email: 'sd3@example.com', passwordHash: 'x', role: 'superadmin' });
    const wh = await Warehouse.create({ name: 'WHD3', address: 'x' });
    const store = await Store.create({ name: 'SD3s', address: 'x' });
    await makeBox({ warehouse: wh, store, code: 'BX-0102' });

    const res = await request(app).get('/api/boxes').set('Authorization', `Bearer ${signToken(admin)}`);
    expect(res.body.boxes[0].createdAt).toBeDefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

From `server/`: `npx jest tests/controllers/boxesList.test.js`
Expected: "filters by from/to createdAt range" FAILS (2 boxes returned) and "returns 400" FAILS (200 returned). "boxes include their createdAt" already PASSES (timestamps are already stored and serialized) — that's fine; it pins the behavior Task 3 depends on.

- [ ] **Step 3: Implement the filter in `listBoxes`**

In `server/controllers/boxController.js`, add to the requires at the top (after line 7):

```js
const { buildDateRangeFilter } = require('../utils/dateRange');
```

In `listBoxes`, change `const { status, search } = req.query;` to:

```js
  const { status, search, from, to } = req.query;
```

Directly after the `filter` object is seeded with `status`/`search` (after `if (search) ...`), add:

```js
  const { range, error } = buildDateRangeFilter(from, to);
  if (error) {
    return res.status(400).json({ message: error });
  }
  if (range) filter.createdAt = range;
```

- [ ] **Step 4: Run tests to verify they pass**

From `server/`: `npx jest tests/controllers/boxesList.test.js`
Expected: PASS (all tests, including the pre-existing seven).

Also run the full server suite to confirm nothing else regressed: `npx jest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/boxController.js server/tests/controllers/boxesList.test.js
git commit -m "feat(server): add from/to createdAt filter to GET /api/boxes"
```

---

### Task 3: Warehouse Boxes page — Created column, date filter, History link

**Files:**
- Modify: `client/src/pages/warehouse/BoxesPage.jsx`
- Test: `client/src/test/warehouse/BoxesPage.test.jsx`

**Interfaces:**
- Consumes: `GET /boxes` with optional `from`/`to` params (Task 2); `box.createdAt` ISO string in responses.
- Produces: each box row links to `/warehouse/history?box=<box._id>` — Task 4's page must read the `box` search param.

- [ ] **Step 1: Rewrite the test file with failing tests**

Replace the full contents of `client/src/test/warehouse/BoxesPage.test.jsx` with (changes: `MemoryRouter` wrapper because the page now renders `Link`s; `createdAt` in mock data; new assertions for the Created column, History link, and date-filter params; the conditional-spread means the no-date request keeps its original param shape):

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BoxesPage from '../../pages/warehouse/BoxesPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

function renderPage() {
  return render(
    <MemoryRouter>
      <BoxesPage />
    </MemoryRouter>
  );
}

describe('BoxesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists boxes and creates a new one, showing its QR', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' }, createdAt: '2026-07-01T10:00:00.000Z' }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [{ _id: 's1', name: 'Store 1' }] } });
      if (url === '/items') return Promise.resolve({ data: { items: [{ _id: 'i1', name: 'Indomie' }] } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    apiClient.post = vi.fn().mockResolvedValue({ data: { box: { code: 'BX-0002' }, qrDataUrl: 'data:image/png;base64,XYZ' } });

    renderPage();
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

  test('shows when each box was created and links to its history', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [{ _id: 'b1', code: 'BX-0001', status: 'PACKED', destinationStore: { name: 'Store 1' }, createdAt: '2026-07-01T10:00:00.000Z' }], total: 1, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-07-01T10:00:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /history/i })).toHaveAttribute('href', '/warehouse/history?box=b1');
  });

  test('filters by status', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => screen.getByLabelText(/status/i));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'DELIVERED' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { status: 'DELIVERED', search: '', page: 1, limit: 10 } })
    );
  });

  test('filters by created date range', async () => {
    apiClient.get = vi.fn((url) => {
      if (url === '/boxes') return Promise.resolve({ data: { boxes: [], total: 0, page: 1, limit: 10 } });
      if (url === '/stores') return Promise.resolve({ data: { stores: [] } });
      if (url === '/items') return Promise.resolve({ data: { items: [] } });
      return Promise.reject(new Error('unexpected'));
    });

    renderPage();
    await waitFor(() => screen.getByLabelText(/created from/i));
    fireEvent.change(screen.getByLabelText(/created from/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/created to/i), { target: { value: '2026-07-15' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/boxes', {
        params: { status: '', search: '', page: 1, limit: 10, from: '2026-07-01', to: '2026-07-15' },
      })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

From `client/`: `npx vitest run src/test/warehouse/BoxesPage.test.jsx`
Expected: "shows when each box was created..." and "filters by created date range" FAIL (missing labels/columns); the two pre-existing tests PASS (the `MemoryRouter` wrapper is harmless).

- [ ] **Step 3: Implement the page changes**

In `client/src/pages/warehouse/BoxesPage.jsx`:

Add the import at the top (after the react import):

```jsx
import { Link } from 'react-router-dom';
```

Add two state hooks after `const [search, setSearch] = useState('');`:

```jsx
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
```

Replace `loadBoxes` with (conditional spread keeps the no-date request identical to before):

```jsx
  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', {
      params: { status, search, page: 1, limit: 10, ...(from && { from }), ...(to && { to }) },
    });
    setBoxes(res.data.boxes);
  }, [status, search, from, to]);
```

In the `filter-bar` div, after the search input's `<div>`, add:

```jsx
        <div>
          <label htmlFor="box-from">Created from</label>
          <input id="box-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="box-to">Created to</label>
          <input id="box-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
```

Replace the table header row with:

```jsx
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Destination</th>
            <th>Created</th>
            <th></th>
          </tr>
```

Replace the table body row with:

```jsx
            <tr key={box._id}>
              <td className="font-mono">{box.code}</td>
              <td><span className={`badge badge-${box.status}`}>{box.status}</span></td>
              <td>{box.destinationStore?.name}</td>
              <td>{box.createdAt ? new Date(box.createdAt).toLocaleString() : '-'}</td>
              <td>
                <Link className="btn-sm" to={`/warehouse/history?box=${box._id}`}>History</Link>
              </td>
            </tr>
```

- [ ] **Step 4: Run tests to verify they pass**

From `client/`: `npx vitest run src/test/warehouse/BoxesPage.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/warehouse/BoxesPage.jsx client/src/test/warehouse/BoxesPage.test.jsx
git commit -m "feat(client): show box created time and date filter on warehouse Boxes page"
```

---

### Task 4: Warehouse History page (route + nav)

**Files:**
- Create: `client/src/pages/warehouse/HistoryPage.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Layout.jsx` (NAV_ITEMS only)
- Test: `client/src/test/warehouse/HistoryPage.test.jsx` (create)

**Interfaces:**
- Consumes: `GET /logs` with params `{ page, limit, box?, from?, to? }` (Task 1); each log is `{ _id, timestamp, action, actor: { name }, box: { code } | null }`. Reads the `box` URL search param set by Task 3's History links.
- Produces: default-exported React component `WarehouseHistoryPage` mounted at `/warehouse/history` for `warehouse_admin`; nav label "History".

- [ ] **Step 1: Write the failing tests**

Create `client/src/test/warehouse/HistoryPage.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WarehouseHistoryPage from '../../pages/warehouse/HistoryPage';
import apiClient from '../../api/client';

vi.mock('../../api/client');

const LOGS = [
  {
    _id: 'l1',
    timestamp: '2026-07-01T10:00:00.000Z',
    action: 'BOX_PACKED',
    actor: { name: 'Wanda' },
    box: { code: 'BX-0001' },
  },
  {
    _id: 'l2',
    timestamp: '2026-07-02T11:00:00.000Z',
    action: 'DELIVERED',
    actor: { name: 'Sari' },
    box: { code: 'BX-0001' },
  },
];

function renderPage(initialEntry = '/warehouse/history') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WarehouseHistoryPage />
    </MemoryRouter>
  );
}

describe('WarehouseHistoryPage', () => {
  beforeEach(() => vi.resetAllMocks());

  test('lists box events with time, code, action, and actor', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: LOGS, total: 2, page: 1, limit: 50 } });

    renderPage();
    await waitFor(() => expect(screen.getByText('BOX_PACKED')).toBeInTheDocument());

    expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 50 } });
    expect(screen.getAllByText('BX-0001')).toHaveLength(2);
    expect(screen.getByText('Wanda')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-07-01T10:00:00.000Z').toLocaleString())).toBeInTheDocument();
  });

  test('filters by date range', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: [], total: 0, page: 1, limit: 50 } });

    renderPage();
    await waitFor(() => screen.getByLabelText(/from/i));
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: '2026-07-01' } });
    fireEvent.change(screen.getByLabelText(/^to$/i), { target: { value: '2026-07-15' } });

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/logs', {
        params: { page: 1, limit: 50, from: '2026-07-01', to: '2026-07-15' },
      })
    );
  });

  test('scopes to a single box when ?box= is in the URL', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { logs: [LOGS[0]], total: 1, page: 1, limit: 50 } });

    renderPage('/warehouse/history?box=b1');
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/logs', { params: { page: 1, limit: 50, box: 'b1' } })
    );
    expect(screen.getByRole('link', { name: /show all/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `client/`: `npx vitest run src/test/warehouse/HistoryPage.test.jsx`
Expected: FAIL — cannot resolve `../../pages/warehouse/HistoryPage`.

- [ ] **Step 3: Implement the page**

Create `client/src/pages/warehouse/HistoryPage.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';

export default function WarehouseHistoryPage() {
  const [logs, setLogs] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchParams] = useSearchParams();
  const box = searchParams.get('box') || '';

  const loadLogs = useCallback(async () => {
    const res = await apiClient.get('/logs', {
      params: { page: 1, limit: 50, ...(box && { box }), ...(from && { from }), ...(to && { to }) },
    });
    setLogs(res.data.logs);
  }, [box, from, to]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div>
      <h1>Box History</h1>

      <div className="filter-bar">
        <div>
          <label htmlFor="history-from">From</label>
          <input id="history-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="history-to">To</label>
          <input id="history-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {box && (
        <p className="mb-sm">
          Showing history for one box. <Link to="/warehouse/history">Show all</Link>
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Box</th>
            <th>Action</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log._id}>
              <td>{new Date(log.timestamp).toLocaleString()}</td>
              <td className="font-mono">{log.box?.code || '-'}</td>
              <td><span className="badge">{log.action}</span></td>
              <td>{log.actor?.name || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {logs.length === 0 && (
        <div className="empty">
          <p>No history in this range</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `client/`: `npx vitest run src/test/warehouse/HistoryPage.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Register the route and nav item**

In `client/src/App.jsx`, add the import after `import TrackingPage from './pages/warehouse/TrackingPage';`:

```jsx
import WarehouseHistoryPage from './pages/warehouse/HistoryPage';
```

(The name `WarehouseHistoryPage` avoids clashing with the store `HistoryPage` import already in this file.)

Inside the `warehouse_admin` `ProtectedRoute` block, after the `/warehouse/tracking` route, add:

```jsx
            <Route path="/warehouse/history" element={<WarehouseHistoryPage />} />
```

In `client/src/components/Layout.jsx`, in `NAV_ITEMS.warehouse_admin`, after the Tracking entry, add:

```jsx
    { to: '/warehouse/history', label: 'History' },
```

- [ ] **Step 6: Run the full client suite**

From `client/`: `npx vitest run`
Expected: PASS (App/Layout tests unaffected — they assert presence, not absence, of warehouse nav items).

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/warehouse/HistoryPage.jsx client/src/App.jsx client/src/components/Layout.jsx client/src/test/warehouse/HistoryPage.test.jsx
git commit -m "feat(client): add warehouse box history page with date filter"
```

---

### Task 5: Scan-assign response includes box codes and destinations

**Files:**
- Modify: `server/controllers/scanController.js` (the `scanDriverAssign` function, lines 7-38)
- Test: `server/tests/controllers/driverAssign.test.js`

**Interfaces:**
- Consumes: existing `scanDriverAssign` flow (`Box.find` on `boxIds`, `updateMany` to `ASSIGNED`).
- Produces: `POST /api/scan/driver` response gains `boxes: [{ id: string, code: string, destinationStore: { name: string, address: string | null } | null }]` alongside the existing `message` and `driver` fields.

- [ ] **Step 1: Write the failing test**

Append inside the `describe('POST /api/scan/driver', ...)` block of `server/tests/controllers/driverAssign.test.js` (line 31). All needed models and `signToken` are already imported at the top of that file, and it has a `makePackedBox(wh, store, code)` helper:

```js
  test('response includes assigned box codes and destinations', async () => {
    const wh = await Warehouse.create({ name: 'WH-M', address: 'x' });
    const store = await Store.create({ name: 'Toko Manifest', address: 'Jl. Mawar 1' });
    const whAdmin = await User.create({ name: 'WA-M', email: 'wam@example.com', passwordHash: 'x', role: 'warehouse_admin', warehouse: wh._id });
    await User.create({ name: 'D-M', email: 'dm@example.com', passwordHash: 'x', role: 'driver', driverQrToken: 'drv-token-m' });
    const box = await makePackedBox(wh, store, 'BX-M1');

    const res = await request(app)
      .post('/api/scan/driver')
      .set('Authorization', `Bearer ${signToken(whAdmin)}`)
      .send({ token: 'drv-token-m', boxIds: [box._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0]).toEqual({
      id: box._id.toString(),
      code: 'BX-M1',
      destinationStore: { name: 'Toko Manifest', address: 'Jl. Mawar 1' },
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

From `server/`: `npx jest tests/controllers/driverAssign.test.js`
Expected: the new test FAILS (`res.body.boxes` is undefined); pre-existing tests PASS.

- [ ] **Step 3: Implement**

In `server/controllers/scanController.js`, inside `scanDriverAssign`, change the box lookup (line 25) to populate the destination:

```js
  const boxes = await Box.find({ _id: { $in: boxIds }, warehouse: req.user.warehouse, status: 'PACKED' })
    .populate('destinationStore', 'name address');
```

Replace the final `res.json(...)` with:

```js
  res.json({
    message: `${boxes.length} box(es) assigned to ${driver.name}`,
    driver: { id: driver._id.toString(), name: driver.name },
    boxes: boxes.map((b) => ({
      id: b._id.toString(),
      code: b.code,
      destinationStore: b.destinationStore
        ? { name: b.destinationStore.name, address: b.destinationStore.address ?? null }
        : null,
    })),
  });
```

- [ ] **Step 4: Run tests to verify they pass**

From `server/`: `npx jest tests/controllers/driverAssign.test.js`
Expected: PASS. Then run the full server suite: `npx jest` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add server/controllers/scanController.js server/tests/controllers/driverAssign.test.js
git commit -m "feat(server): return assigned box details from driver-assign scan"
```

---

### Task 6: Driver manifest on the "My QR" page

**Files:**
- Modify: `client/src/pages/driver/DriverQrPage.jsx`
- Test: `client/src/test/driver/DriverQrPage.test.jsx` (create)

**Interfaces:**
- Consumes: `GET /boxes` (drivers are server-side scoped to `assignedDriver`, Task 2 left this untouched) returning boxes with `code`, `status`, `destinationStore: { name, address }`. `useAuth()` supplying `user.driverQrToken` / `user.name`.
- Produces: the page polls every 15 s and lists ASSIGNED / IN_TRANSIT boxes under a "Packages you carry" heading, so the manifest appears moments after the warehouse scans the driver's QR.

- [ ] **Step 1: Write the failing tests**

Create `client/src/test/driver/DriverQrPage.test.jsx`:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DriverQrPage from '../../pages/driver/DriverQrPage';
import apiClient from '../../api/client';
import * as AuthContextModule from '../../context/AuthContext';

vi.mock('../../api/client');
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}));

describe('DriverQrPage', () => {
  beforeEach(() => {
    // clearAllMocks (not resetAllMocks): resetting would wipe the qrcode
    // factory's mockResolvedValue and toDataURL would return undefined
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'd1', role: 'driver', name: 'Dri', driverQrToken: 'tok-1' },
    });
  });

  test('lists the packages the driver carries with code and destination', async () => {
    apiClient.get = vi.fn().mockResolvedValue({
      data: {
        boxes: [
          { _id: 'b1', code: 'BX-0001', status: 'ASSIGNED', destinationStore: { name: 'Toko A', address: 'Jl. Mawar 1' } },
          { _id: 'b2', code: 'BX-0002', status: 'IN_TRANSIT', destinationStore: { name: 'Toko B', address: 'Jl. Melati 2' } },
          { _id: 'b3', code: 'BX-0003', status: 'DELIVERED', destinationStore: { name: 'Toko C', address: 'Jl. Anggrek 3' } },
        ],
        total: 3,
        page: 1,
        limit: 50,
      },
    });

    render(<DriverQrPage />);
    await waitFor(() => expect(screen.getByText('BX-0001')).toBeInTheDocument());

    expect(apiClient.get).toHaveBeenCalledWith('/boxes', { params: { page: 1, limit: 50 } });
    expect(screen.getByText(/packages you carry/i)).toBeInTheDocument();
    expect(screen.getByText('Toko A')).toBeInTheDocument();
    expect(screen.getByText('Jl. Mawar 1')).toBeInTheDocument();
    expect(screen.getByText('BX-0002')).toBeInTheDocument();
    // DELIVERED boxes are history, not cargo
    expect(screen.queryByText('BX-0003')).not.toBeInTheDocument();
  });

  test('shows an empty message when carrying nothing', async () => {
    apiClient.get = vi.fn().mockResolvedValue({ data: { boxes: [], total: 0, page: 1, limit: 50 } });

    render(<DriverQrPage />);
    await waitFor(() => expect(screen.getByText(/no packages assigned yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

From `client/`: `npx vitest run src/test/driver/DriverQrPage.test.jsx`
Expected: FAIL — no `/boxes` call, no "Packages you carry" text.

- [ ] **Step 3: Implement**

Replace the full contents of `client/src/pages/driver/DriverQrPage.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import QrDisplay from '../../components/QrDisplay';

const POLL_INTERVAL_MS = 15000;

export default function DriverQrPage() {
  const { user } = useAuth();
  const [dataUrl, setDataUrl] = useState('');
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    if (!user?.driverQrToken) return;
    const payload = JSON.stringify({ type: 'driver', token: user.driverQrToken });
    QRCode.toDataURL(payload, { width: 200, margin: 2 }).then(setDataUrl);
  }, [user?.driverQrToken]);

  const loadBoxes = useCallback(async () => {
    const res = await apiClient.get('/boxes', { params: { page: 1, limit: 50 } });
    setBoxes(res.data.boxes);
  }, []);

  useEffect(() => {
    loadBoxes();
    const poll = setInterval(loadBoxes, POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [loadBoxes]);

  const carrying = boxes.filter((b) => ['ASSIGNED', 'IN_TRANSIT'].includes(b.status));

  if (!user?.driverQrToken) {
    return (
      <div>
        <h1>My QR</h1>
        <p>QR code not available for your account.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>My QR</h1>
      <p>Show this QR code to the warehouse admin to be assigned deliveries.</p>
      <QrDisplay
        dataUrl={dataUrl}
        label={user.name}
        companyName="PT PecutAI International"
      />

      <div className="section">
        <div className="section-header">
          <h2>Packages you carry</h2>
        </div>
        {carrying.length === 0 ? (
          <div className="empty">
            <p>No packages assigned yet</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {carrying.map((box) => (
                <tr key={box._id}>
                  <td className="font-mono font-bold">{box.code}</td>
                  <td>
                    {box.destinationStore?.name || '-'}
                    {box.destinationStore?.address && <div>{box.destinationStore.address}</div>}
                  </td>
                  <td>
                    <span className={`badge badge-${box.status === 'IN_TRANSIT' ? 'orange' : 'yellow'}`}>
                      {box.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `client/`: `npx vitest run src/test/driver/DriverQrPage.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/driver/DriverQrPage.jsx client/src/test/driver/DriverQrPage.test.jsx
git commit -m "feat(client): show carried packages on driver My QR page"
```

---

### Task 7: Store admins see their store in the Layout

**Files:**
- Modify: `client/src/components/Layout.jsx`
- Test: `client/src/test/Layout.test.jsx`

**Interfaces:**
- Consumes: `useAuth().user.store` — `/auth/me` already returns `{ id, name, address, coords }` for store admins (see `toPublicUser` in `server/controllers/authController.js`). No backend change.
- Produces: nav shows the store name (and address when present) for `store_admin` users on every store page.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('Layout', ...)` block of `client/src/test/Layout.test.jsx`:

```jsx
  test('shows the store name and address for a store_admin user', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: '3',
        role: 'store_admin',
        name: 'Sari',
        store: { id: 's1', name: 'Toko Maju', address: 'Jl. Mawar 1' },
      },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.getByText('Toko Maju')).toBeInTheDocument();
    expect(screen.getByText('Jl. Mawar 1')).toBeInTheDocument();
  });

  test('shows no store info for non-store roles', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: '2', role: 'driver', name: 'Dri' },
      logout: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText(/your store/i)).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify the new one fails**

From `client/`: `npx vitest run src/test/Layout.test.jsx`
Expected: "shows the store name and address..." FAILS; the other three PASS.

- [ ] **Step 3: Implement**

In `client/src/components/Layout.jsx`, inside the `<nav>` element, between the `</ul>` and the logout button, add:

```jsx
        {user?.role === 'store_admin' && user.store && (
          <div className="store-info" aria-label="Your store">
            <strong>{user.store.name}</strong>
            {user.store.address && <div>{user.store.address}</div>}
          </div>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

From `client/`: `npx vitest run src/test/Layout.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Run both full suites as a final check**

From `client/`: `npx vitest run` — expected PASS.
From `server/`: `npx jest` — expected PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Layout.jsx client/src/test/Layout.test.jsx
git commit -m "feat(client): show assigned store info in nav for store admins"
```
