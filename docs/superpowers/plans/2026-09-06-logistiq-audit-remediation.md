# LogistiQ Audit Remediation Implementation Plan

**Status:** Complete. All planned remediation tasks and regression verification have been executed in the working tree.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the verified security, data-integrity, configuration, runtime, dashboard, lint, and dependency issues found during the full LogistiQ audit, with regression coverage and fresh end-to-end verification.

**Architecture:** Keep the existing Express/Mongoose and React/Vite architecture. Add scoped authorization at the tracking route boundary, make inventory state transitions atomic through MongoDB transactions with an in-memory-test replica set, centralize client API configuration with a development proxy, and make dashboard/map behavior derive from validated data. Preserve the existing legacy driver-location endpoints used by the driver page while hardening the newer tracking endpoints used by the warehouse tracking page.

**Tech Stack:** Node.js/CommonJS, Express, Mongoose, MongoDB Memory Server, Jest/Supertest, React, Vite, Vitest/React Testing Library, oxlint.

**Spec:** Verified findings from the 2026-09-06 full audit; supporting product behavior is described in `README.md`, `Propose PRD Inventory Management.md`, and the existing plans under `docs/superpowers/plans/`.

## Global Constraints

- Preserve the current role model: `superadmin`, `warehouse_admin`, `store_admin`, `driver`, and `unassigned`.
- Warehouse admins may only read or mutate tracking data belonging to their linked warehouse; drivers may only mutate their own tracking record.
- Box packing and delivery must never produce negative stock, duplicate delivery credits, or orphaned stock changes when a later operation fails.
- Keep server code CommonJS and client code ESM/JSX.
- No plaintext secrets or real connection strings may be committed.
- Every production behavior change must have a regression test that was observed failing before the implementation.
- All existing server tests, client tests, builds, lint, and dependency audits must be rerun before completion.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `server/tests/setup.js` | Modify | Run MongoDB Memory Server as a single-node replica set so transaction tests exercise real behavior. |
| `server/controllers/boxController.js` | Modify | Validate/aggregate box lines and perform stock decrement, box creation, and packing log in one transaction. |
| `server/controllers/scanController.js` | Modify | Atomically claim a box for delivery, update store stock, and write the delivery log in one transaction. |
| `server/routes/trackingRoutes.js` | Modify | Enforce driver identity, validate target users, and scope warehouse tracking responses/writes. |
| `server/controllers/warehouseDashboardController.js` | Modify | Correct batch assignment KPI log lookup and coordinate checks. |
| `server/tests/controllers/boxIntegrity.test.js` | Create | Regression tests for duplicate lines, invalid quantities, and rollback behavior. |
| `server/tests/controllers/scanBox.test.js` | Modify | Regression test for duplicate delivery requests and transaction-safe stock updates. |
| `server/tests/controllers/tracking.test.js` | Create | Regression tests for driver identity and warehouse visibility boundaries. |
| `server/tests/controllers/warehouseDashboard.test.js` | Modify | Verify QR batch assignment logs contribute to actual delivery-time metrics. |
| `client/.env.example` | Create | Document the frontend API URL expected by local and deployed environments. |
| `server/.env.example` | Create | Document safe local MongoDB and JWT settings without secrets. |
| `client/vite.config.js` | Modify | Proxy `/api` to the local API during development. |
| `client/src/api/client.js` | Modify | Use `/api` as the safe local fallback when `VITE_API_URL` is absent. |
| `client/src/components/LogisticsMap.jsx` | Modify | Filter invalid coordinates before passing positions to Leaflet. |
| `client/src/pages/superadmin/DashboardPage.jsx` | Modify | Render the daily/weekly/monthly selector and remove unused chart state. |
| `client/src/test/components/LogisticsMap.test.jsx` | Create | Verify records without coordinates are ignored. |
| `client/src/test/superadmin/DashboardPage.test.jsx` | Modify | Verify period controls change displayed metrics. |
| `README.md` | Modify | Make setup instructions match the new env examples and proxy fallback. |
| `client/package.json`, `client/package-lock.json` | Modify | Upgrade React Router to a patched version. |

---

### Task 1: Establish transaction-capable regression infrastructure

**Files:**
- Modify: `server/tests/setup.js`
- Create: `server/tests/controllers/boxIntegrity.test.js`
- Modify: `server/tests/controllers/scanBox.test.js`

**Interfaces:**
- `server/tests/setup.js` continues exposing the same Jest lifecycle hooks and Mongoose connection to every existing test.
- New tests use the existing Express routes and models, not controller mocks.

- [ ] **Step 1: Write failing tests**

Add tests proving that duplicate item lines cannot overdraw stock, invalid quantities are rejected without mutation, and a repeated scan cannot credit store stock twice.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run from the repository root:

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/boxIntegrity.test.js tests/controllers/scanBox.test.js
```

Expected result: the duplicate-line test observes a negative warehouse quantity, and the repeated-scan test observes a second stock credit or an inconsistent state.

- [ ] **Step 3: Convert the memory server to a single-node replica set**

Use `MongoMemoryReplSet.create({ replSet: { count: 1 } })`, connect with its URI, and retain the existing cleanup behavior so production transaction semantics are testable.

- [ ] **Step 4: Run the focused tests again**

Run the same command and confirm the tests now reach the application behavior rather than failing on MongoDB startup.

- [ ] **Step 5: Commit**

```powershell
git add server/tests/setup.js server/tests/controllers/boxIntegrity.test.js server/tests/controllers/scanBox.test.js
git commit -m "test: add transaction integrity regressions"
```

### Task 2: Make box packing atomic and quantity-safe

**Files:**
- Modify: `server/controllers/boxController.js`
- Modify: `server/tests/controllers/boxIntegrity.test.js`

**Interfaces:**
- `POST /api/boxes` keeps returning `{ box, qrDataUrl }` on success and existing validation messages/statuses where possible.
- Duplicate item IDs are merged before stock validation and the stored box contains one line per item.

- [ ] **Step 1: Add the failing cases**

Cover non-numeric, zero, negative, fractional, and duplicate item quantities; also force box creation failure after stock validation and assert the stock remains unchanged.

- [ ] **Step 2: Run only the new box tests and confirm failure**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/boxIntegrity.test.js
```

- [ ] **Step 3: Implement the transaction**

Validate each line with `Number.isInteger(line.qty) && line.qty > 0`, aggregate lines by item ID, verify the destination store exists, and execute stock updates, `Box.create`, and `HandoverLog.create` inside `session.withTransaction`. Use conditional `$inc` updates with `$gte` guards so concurrent packers cannot overdraw a row. Generate the code from a unique counter or retry duplicate-key conflicts instead of relying on `countDocuments() + 1`.

- [ ] **Step 4: Verify focused and existing box tests**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/boxIntegrity.test.js tests/controllers/boxes.test.js tests/controllers/boxesList.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/controllers/boxController.js server/tests/controllers/boxIntegrity.test.js
git commit -m "fix: make box packing atomic and quantity-safe"
```

### Task 3: Make delivery idempotent and transactional

**Files:**
- Modify: `server/controllers/scanController.js`
- Modify: `server/tests/controllers/scanBox.test.js`

**Interfaces:**
- `POST /api/scan/box` remains the store-admin delivery endpoint.
- A successful first request returns the current response shape; a second request for the same box returns 400 and does not change store stock.

- [ ] **Step 1: Add a failing repeated-delivery test**

Send two requests for the same assigned box and assert the second is rejected and the store stock equals the box quantity exactly once.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/scanBox.test.js
```

- [ ] **Step 3: Implement atomic delivery**

Within one transaction, claim the box using `findOneAndUpdate({ _id, status: { $in: ['ASSIGNED', 'IN_TRANSIT'] }, destinationStore: req.user.store }, { $set: { status: 'DELIVERED' } })`; only the request that receives the claimed document may increment store stock and create the `DELIVERED` log. Roll back the status if stock/log creation fails.

- [ ] **Step 4: Verify delivery tests**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/scanBox.test.js tests/controllers/dashboard.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/controllers/scanController.js server/tests/controllers/scanBox.test.js
git commit -m "fix: make box delivery idempotent"
```

### Task 4: Harden and scope tracking APIs

**Files:**
- Modify: `server/routes/trackingRoutes.js`
- Create: `server/tests/controllers/tracking.test.js`

**Interfaces:**
- `POST /api/tracking/drivers/:driverId` and `/status` permit a driver only for `req.user.id`; superadmins may target valid driver users; warehouse admins may target drivers assigned to boxes in their warehouse.
- `GET /api/tracking/locations` returns only the linked warehouse, its served stores, and its assigned drivers for warehouse admins; superadmins retain global visibility.

- [ ] **Step 1: Add failing authorization and scope tests**

Assert a driver targeting another driver gets 403, a warehouse admin targeting an unrelated driver gets 403, a non-driver target gets 404/400, and a warehouse admin’s location response excludes another warehouse’s entities.

- [ ] **Step 2: Run focused tracking tests and confirm failure**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/tracking.test.js
```

- [ ] **Step 3: Implement boundary checks**

Validate `driverId`, load the target `User` with `role: 'driver'`, derive warehouse-scoped driver/store IDs from the warehouse and assigned boxes, and apply those filters to reads and writes before upsert.

- [ ] **Step 4: Verify all tracking regressions**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/tracking.test.js tests/controllers/driverLocation.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/routes/trackingRoutes.js server/tests/controllers/tracking.test.js
git commit -m "fix: enforce tracking identity and warehouse scope"
```

### Task 5: Correct driver KPI event linkage

**Files:**
- Modify: `server/controllers/scanController.js`
- Modify: `server/controllers/warehouseDashboardController.js`
- Modify: `server/tests/controllers/warehouseDashboard.test.js`

**Interfaces:**
- Batch QR assignment continues to assign all requested boxes, but writes one `DRIVER_ASSIGNED` log per box with the same actor/driver metadata.
- Warehouse driver performance reports actual minutes for both manual and QR assignments.

- [ ] **Step 1: Add a failing KPI test**

Assign a box through the batch scan route, add a later delivery log, request warehouse driver performance, and assert `avgActualMinutes` is populated.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/warehouseDashboard.test.js tests/controllers/driverAssign.test.js
```

- [ ] **Step 3: Link each assignment log to its box**

Create one log per assigned box with `box: box._id`, preserving the response payload and avoiding the current unlinked batch log. Use null-safe coordinate checks (`!= null`) in performance calculations.

- [ ] **Step 4: Verify dashboard tests**

```powershell
npm.cmd test --prefix server -- --runInBand tests/controllers/warehouseDashboard.test.js tests/controllers/driverAssign.test.js
```

- [ ] **Step 5: Commit**

```powershell
git add server/controllers/scanController.js server/controllers/warehouseDashboardController.js server/tests/controllers/warehouseDashboard.test.js
git commit -m "fix: link batch assignments to driver metrics"
```

### Task 6: Repair client configuration and map safety

**Files:**
- Create: `client/.env.example`
- Create: `server/.env.example`
- Modify: `client/vite.config.js`
- Modify: `client/src/api/client.js`
- Modify: `client/src/components/LogisticsMap.jsx`
- Create: `client/src/test/components/LogisticsMap.test.jsx`
- Modify: `README.md`

**Interfaces:**
- Local development works without a private env file: API requests use `/api` and Vite proxies them to `http://127.0.0.1:5000`.
- Deployed builds may set `VITE_API_URL` explicitly.
- Leaflet receives only finite latitude/longitude pairs.

- [ ] **Step 1: Add failing map/config tests**

Render locations containing missing coordinates and assert only valid markers are rendered. Test the API client source/config so the fallback is `/api`.

- [ ] **Step 2: Run focused client tests and confirm failure**

```powershell
npm.cmd test --prefix client -- src/test/components/LogisticsMap.test.jsx
```

- [ ] **Step 3: Implement configuration and filtering**

Set `baseURL: import.meta.env.VITE_API_URL || '/api'`, add a Vite `/api` proxy to the local server, add safe env examples, update README commands, and filter every map collection with `Number.isFinite` checks before rendering markers.

- [ ] **Step 4: Verify client tests and build**

```powershell
npm.cmd test --prefix client
npm.cmd run build --prefix client
```

- [ ] **Step 5: Commit**

```powershell
git add client/.env.example server/.env.example client/vite.config.js client/src/api/client.js client/src/components/LogisticsMap.jsx client/src/test/components/LogisticsMap.test.jsx README.md
git commit -m "fix: make local API setup and map rendering robust"
```

### Task 7: Restore dashboard period controls and lint cleanliness

**Files:**
- Modify: `client/src/pages/superadmin/DashboardPage.jsx`
- Modify: `client/src/test/superadmin/DashboardPage.test.jsx`

**Interfaces:**
- The dashboard exposes daily, weekly, and monthly period buttons/select controls.
- Selected period changes turnover and flow data shown to the user.

- [ ] **Step 1: Add a failing period-control test**

Render stats with different daily and weekly values, click the weekly control, and assert the weekly delivered quantity is displayed.

- [ ] **Step 2: Run the focused test and confirm failure**

```powershell
npm.cmd test --prefix client -- src/test/superadmin/DashboardPage.test.jsx
```

- [ ] **Step 3: Implement the controls and remove dead variables**

Render `PERIODS.map` buttons using `PERIOD_LABELS`, connect them to `setPeriod`, remove unused category calculations unless they are rendered, and keep the selected period accessible with an active state.

- [ ] **Step 4: Verify focused lint/test**

```powershell
npm.cmd test --prefix client -- src/test/superadmin/DashboardPage.test.jsx
npm.cmd run lint --prefix client
```

- [ ] **Step 5: Commit**

```powershell
git add client/src/pages/superadmin/DashboardPage.jsx client/src/test/superadmin/DashboardPage.test.jsx
git commit -m "fix: restore superadmin dashboard period controls"
```

### Task 8: Patch dependencies and complete verification

**Files:**
- Modify: `client/package.json`
- Modify: `client/package-lock.json`

- [ ] **Step 1: Upgrade React Router to a patched compatible release**

Run `npm.cmd install --prefix client react-router-dom@^7.18.2` and verify the resolved `react-router` version is at least `7.18.2`.

- [ ] **Step 2: Run dependency audits**

```powershell
npm.cmd audit --omit=dev --prefix client
npm.cmd audit --omit=dev --prefix server
```

Document any remaining server advisories that have no upstream fix rather than forcing an incompatible major upgrade.

- [ ] **Step 3: Run the complete verification suite**

```powershell
npm.cmd run test:server
npm.cmd run test:client
npm.cmd run build --prefix client
npm.cmd run lint --prefix client
git diff --check
git status --short --branch
```

- [ ] **Step 4: Review every finding against evidence**

Confirm the duplicate-line reproduction no longer produces negative stock, the tracking reproduction returns authorization failures and scoped results, the Vite fallback points to `/api`, the map ignores invalid coordinates, the dashboard period test passes, and the KPI test reports actual time for QR assignments.

- [ ] **Step 5: Commit**

```powershell
git add client/package.json client/package-lock.json
git commit -m "chore: patch client routing dependency"
```
