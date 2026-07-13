# PRD — LogistiQ: Multi-Warehouse Stock & Delivery Tracking System

**Project:** KADA Batch 4 Group Project (Full-Stack)
**Theme:** Inventory Management
**Deadline:** Thursday afternoon (live demo + architecture overview)
**Stack:** React (Vite) + Express.js + MongoDB Atlas (Mongoose)

---

## 1. Product Overview

LogistiQ is a warehouse-to-store replenishment and delivery tracking system, modeled on a retail chain (e.g., Alfamart) that operates multiple warehouses supplying multiple stores.

**The core loop:**

1. Store stock drops below a per-item threshold → warehouse admin sees an **alert**.
2. Warehouse admin packs a **box** (multiple items + quantities, one destination store) → system generates a **QR code** for the box and decrements warehouse stock.
3. Warehouse admin scans a **driver's personal QR** → all staged boxes are assigned to that driver.
4. Driver sees assigned boxes + destinations on their (mobile web) page. While delivering, their **last-known location** is visible to warehouse admin and superadmin on a map.
5. Store admin scans each box QR on arrival → box contents are **automatically added to store stock**, box marked DELIVERED, handover logged.
6. Store admin performs end-of-day **stock opname** (adjust quantities, logged for audit).
7. Superadmin manages users/roles, warehouses, stores, and warehouse stock, and sees the global dashboard + map.

**Why this satisfies the rubric:**

| Requirement | How we exceed it |
| --- | --- |
| CRUD + protected routes | CRUD on users, items, warehouses, stores, boxes, stock — all behind JWT + role middleware |
| Auth (hashed pw, persistent) | bcrypt + JWT (localStorage), 4-role RBAC, role-assignment admin panel |
| DB: ≥2 collections, ≥1 relation | 8 collections, 10+ relations |
| React: ≥2 components, ≥2 routes | ~10 routes, 20+ components, useState/useEffect/Context |
| Express: ≥2 endpoints | ~25 endpoints |
| Optional features | QR generation & scanning, geolocation map, threshold alerts, search/filter/pagination, responsive design, SweetAlert, dotenv |

---

## 2. User Hierarchy & Permissions

```
superadmin
   └── warehouse_admin
   └── store_admin
   └── driver
(unassigned — new registrations, no access until superadmin assigns a role)
```

| Capability | superadmin | warehouse_admin | store_admin | driver |
| --- | :-: | :-: | :-: | :-: |
| Assign/modify user roles | ✅ | ❌ | ❌ | ❌ |
| CRUD warehouses & stores | ✅ | ❌ | ❌ | ❌ |
| CRUD item catalog | ✅ | ❌ | ❌ | ❌ |
| Add stock to warehouse (add only) | ✅ | ❌ | ❌ | ❌ |
| Global dashboard + map (all warehouses, stores, drivers) | ✅ | ❌ | ❌ | ❌ |
| View store stock + threshold alerts (their linked stores) | ✅ | ✅ | own store | ❌ |
| Create box (items + qty + destination), generate box QR | ❌ | ✅ | ❌ | ❌ |
| Scan driver QR → assign staged boxes to driver | ❌ | ✅ | ❌ | ❌ |
| View driver last-known locations (their deliveries) | ✅ | ✅ | ❌ | ❌ |
| See assigned boxes + destinations ("notifications") | ❌ | ❌ | ❌ | ✅ |
| Send location while delivering | ❌ | ❌ | ❌ | ✅ |
| Scan box QR → auto stock-in to store | ❌ | ❌ | ✅ | ❌ |
| End-of-day stock adjustment (opname) | ❌ | ❌ | ✅ | ❌ |
| Show personal driver QR | ❌ | ❌ | ❌ | ✅ |

**Scoping rules:**
- `warehouse_admin` is linked to exactly one warehouse (`user.warehouse`), and that warehouse serves one or more stores (`warehouse.stores[]`). They only see stock/alerts for those stores.
- `store_admin` is linked to exactly one store (`user.store`).
- `driver` sees only boxes assigned to them.
- New users register as `unassigned` and land on a "waiting for role" page.

---

## 3. Database Schema (Mongoose)

8 collections. Arrows = `ObjectId` refs.

```
User        { name, email (unique), passwordHash, role: enum[superadmin,
              warehouse_admin, store_admin, driver, unassigned],
              warehouse → Warehouse?, store → Store?, driverQrToken? (uuid) }

Warehouse   { name, address, coords: {lat, lng}, capacityM3, areaM2,
              stores: [→ Store] }

Store       { name, address, coords: {lat, lng} }

Item        { name, sku (unique), unit (pcs/box/kg), volumeM3? }

WarehouseStock { warehouse → Warehouse, item → Item, qty }
              // unique compound index (warehouse, item)

StoreStock  { store → Store, item → Item, qty, threshold }
              // unique compound index (store, item)
              // ALERT when qty < threshold (computed on read, no cron)

Box         { code (human-readable, e.g. BX-0007), qrToken (uuid),
              warehouse → Warehouse, destinationStore → Store,
              items: [{ item → Item, qty }],
              status: enum[PACKED, ASSIGNED, IN_TRANSIT, DELIVERED],
              assignedDriver → User?, timestamps }

HandoverLog { box → Box?, actor → User, action: enum[BOX_PACKED,
              DRIVER_ASSIGNED, PICKED_UP, DELIVERED, STOCK_ADJUSTED,
              WAREHOUSE_STOCK_ADDED],
              coords: {lat, lng}?, meta (mixed), timestamp }

DriverLocation { driver → User, coords: {lat, lng}, updatedAt }
              // one doc per driver, upsert on every ping (last-known only)
```

**Business rules enforced in controllers:**
1. Creating a Box **decrements WarehouseStock** per line item; reject if insufficient stock (400 with per-item message).
2. Store-admin scan of a valid box QR: verify `qrToken` + box status is ASSIGNED/IN_TRANSIT + scanning user's store == `destinationStore` → **increment StoreStock** per line item (upsert), set status DELIVERED, write HandoverLog with coords. All in one endpoint.
3. QR payloads contain **only** `{ type: "box"|"driver", id, token }` — never item contents. The scanner calls the API; the API resolves contents. Prevents forgery and keeps QR density low.
4. Stock opname writes a `STOCK_ADJUSTED` HandoverLog with old/new qty in `meta`.
5. Every role-gated endpoint uses `authRequired` + `requireRole(...)` middleware.

---

## 4. API Endpoints (Express, prefix `/api`)

**Auth**
| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | /auth/register | public | creates user as `unassigned`, bcrypt hash |
| POST | /auth/login | public | returns JWT (payload: id, role) |
| GET | /auth/me | any logged-in | current user + linked warehouse/store |

**Users (admin panel)**
| POST/GET | /users | superadmin | list w/ search + pagination |
| PATCH | /users/:id/role | superadmin | body: { role, warehouse?, store? } |
| DELETE | /users/:id | superadmin | |

**Master data**
| CRUD | /warehouses | superadmin (read: wh_admin own) | includes stores[] linkage |
| CRUD | /stores | superadmin (read: store_admin own) | |
| CRUD | /items | superadmin (read: all roles) | catalog |

**Stock**
| GET | /warehouse-stock?warehouse= | superadmin, wh_admin | |
| POST | /warehouse-stock/add | superadmin | add-only, logs WAREHOUSE_STOCK_ADDED |
| GET | /store-stock?store= | superadmin, wh_admin (linked stores), store_admin (own) | returns `belowThreshold` flag per row |
| GET | /alerts | superadmin, wh_admin | all StoreStock rows where qty < threshold, scoped |
| PATCH | /store-stock/:id/adjust | store_admin | opname; logs STOCK_ADJUSTED |
| PATCH | /store-stock/:id/threshold | wh_admin, superadmin | set threshold |

**Boxes & QR**
| POST | /boxes | wh_admin | validates & decrements warehouse stock; returns box + QR PNG (dataURL) |
| GET | /boxes | role-scoped | wh_admin: own warehouse; driver: assigned; superadmin: all. Filter by status, search by code, paginate |
| GET | /boxes/:id/qr | wh_admin | regenerate QR image |
| POST | /scan/driver | wh_admin | body: { token } from driver QR + boxIds[] → assign all, status ASSIGNED, log DRIVER_ASSIGNED. **Fallback:** POST /boxes/:id/assign { driverId } (manual dropdown) |
| POST | /scan/box | store_admin | body: { token, coords? } → the "money" endpoint (rule #2 above) |
| PATCH | /boxes/:id/pickup | driver | status → IN_TRANSIT, logs PICKED_UP with coords |

**Tracking & dashboard**
| POST | /driver-location | driver | upsert own coords (ping every 30–60s while "delivering" toggle on) |
| GET | /driver-locations | superadmin, wh_admin | last-known positions, scoped |
| GET | /dashboard/stats | superadmin | counts: boxes by status, total users, low-stock alerts, warehouse utilization (Σ box/stock volume ÷ capacityM3 if volumeM3 present) |
| GET | /logs?box=&store=... | superadmin, wh_admin | HandoverLog audit trail, paginated |

---

## 5. Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + Vite, react-router-dom v6 | fast dev, required |
| State | Context API for auth (user, token); local state elsewhere | Redux is overkill here; mention as trade-off in presentation |
| UI | Tailwind CSS (or plain CSS modules) + SweetAlert2 | fast, responsive, optional-feature points |
| QR generate | `qrcode` (backend, returns dataURL PNG) | print/screen-friendly |
| QR scan | `html5-qrcode` (frontend, works in mobile browsers) | no native app needed |
| Map | `react-leaflet` + OpenStreetMap tiles | free, no API key |
| Geolocation | `navigator.geolocation` | built-in |
| Backend | Express.js, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, `uuid` | class stack |
| DB | MongoDB Atlas + Mongoose | class stack |
| Deploy (demo) | Local + **ngrok** HTTPS tunnel | phone camera requires HTTPS for getUserMedia — test this EARLY |
| Seed | `npm run seed` script | 1 superadmin, 1 wh_admin, 1 store_admin, 1 driver, 2 warehouses, 3 stores, ~10 items, stock rows |

**Repo layout (monorepo):**
```
/client   → Vite React app
/server   → Express app (routes/ controllers/ models/ middleware/ seed.js)
```

---

## 6. Screen-by-Screen Breakdown

All screens share `<Layout>` with a role-filtered sidebar. `<ProtectedRoute allowedRoles={[...]}>` wraps each route group.

### Public
1. **/login** — email+password, redirect by role after login.
2. **/register** — name/email/password → lands on /pending.
3. **/pending** — "Your account is awaiting role assignment." (shown to `unassigned`)

### Superadmin
4. **/admin/users** — table (search, paginate), role dropdown per row + warehouse/store picker when relevant, delete w/ SweetAlert confirm. *Demo moment: assign role live, user refreshes, UI transforms.*
5. **/admin/warehouses** — cards/table with capacityM3, areaM2, utilization bar; create/edit form where **coords are set by clicking the Leaflet map** (no geocoding); link stores via multiselect.
6. **/admin/stores** — same pattern as warehouses.
7. **/admin/items** — item catalog CRUD.
8. **/admin/warehouse-stock** — pick warehouse → add qty to item (add-only form).
9. **/dashboard** — stat cards (boxes by status, alerts count, users), Leaflet map with warehouse markers (blue), store markers (green), driver last-known markers (orange, "updated X min ago"), recent HandoverLog feed.

### Warehouse Admin
10. **/warehouse/alerts** — red cards: "Store X — Item Y: 3 left (threshold 10)" + button "Pack a box for this store". This is the landing page.
11. **/warehouse/stock** — own warehouse stock table + linked stores' stock tabs; edit thresholds.
12. **/warehouse/boxes** — list own boxes w/ status filter & search; **Create Box** form: destination store select, line items (item + qty rows, validated against warehouse stock), submit → modal shows generated QR (print button).
13. **/warehouse/assign** — staged (PACKED) boxes checklist + **scanner** (html5-qrcode) to scan driver QR → assigns all checked boxes. Manual driver dropdown as fallback button.
14. **/warehouse/tracking** — map of driver last-known positions for boxes from this warehouse.

### Driver (mobile-first styling: big buttons, single column)
15. **/driver** — "My Deliveries": assigned boxes grouped by destination store with address + map pin link; badge count polls /boxes every 15s (the "notification"). Buttons: **Pick up** (→ IN_TRANSIT, sends coords), **Delivering toggle** (starts 30–60s location pings while tab open).
16. **/driver/qr** — full-screen personal QR (driverQrToken) for the warehouse admin to scan.

### Store Admin
17. **/store/scan** — camera scanner; on successful box scan → SweetAlert success listing items added; errors for wrong store / already delivered / invalid token.
18. **/store/stock** — own store stock table with threshold badges; **Opname mode**: qty fields become editable, save writes adjustments + logs.
19. **/store/history** — delivered boxes + adjustment log for this store.

---

## 7. Work Split (vertical slices, 4 people)

| Person | Slice (end-to-end: model + endpoints + screens) |
| --- | --- |
| A | Auth, JWT/role middleware, admin panel (users/roles), pending page, Layout/ProtectedRoute shell |
| B | Master data + stock: items, warehouses, stores, warehouse-stock add, store-stock, thresholds, alerts, opname |
| C | Boxes + QR: create box (stock decrement), QR generate, driver-assign scan + fallback, store scan-in, HandoverLog |
| D | Driver page + notifications polling, driver QR, location pings, maps (dashboard + tracking), seed script, deploy/ngrok |

**Day plan:** Day 1 — agree schema (this doc), A ships auth shell, everyone scaffolds their models/routes. Day 2 — all slices functional against seed data. Day 3 (Wed) — integration, QR scan tested on a real phone via ngrok, map polish. Thursday AM — demo rehearsal with the scripted flow below, freeze code.

**Cut order if behind (safe to drop, story survives):** live location pings → tracking map → driver-QR assign (keep dropdown) → utilization bars → pagination.

---

## 8. Demo Script (5 minutes)

1. Register a new user live → pending page → superadmin assigns `store_admin` → refresh → store UI appears. *(RBAC shown)*
2. Superadmin dashboard: map + stats. Add stock to Warehouse A.
3. Warehouse admin logs in → **alert**: Store 1 low on Item X → creates a box (X:10, Y:20) → QR appears; warehouse stock visibly decreases.
4. Scan driver's QR (phone shows /driver/qr) → box ASSIGNED → driver's phone badge updates.
5. Driver taps Pick up → superadmin map shows driver marker.
6. Store admin scans the box QR from the projector → SweetAlert "10× Item X, 20× Item Y added" → store stock updated, alert cleared, log entry visible. *(the money moment)*
7. Q&A prep: why token-only QR payloads (security), why last-known vs websocket tracking (trade-off), why Context over Redux.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Phone camera blocked on HTTP | ngrok HTTPS tunnel; test Day 2, not Thursday |
| Camera fails during demo | manual driver dropdown + "enter box code" text fallback on scan pages |
| Seven+ collections, thin seed data | seed.js is a Day-1 deliverable, not an afterthought |
| Race: two admins pack same stock | acceptable for demo; mention as known limitation if asked |
| Scope creep | anything not in this doc is out until the demo script passes end-to-end |
