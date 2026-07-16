# LogistiQ REST API Schema

Base URL: `http://localhost:5000/api`

Authentication: `Authorization: Bearer <token>`

---

## Roles

| Role | Access |
|------|--------|
| `superadmin` | Full access to all endpoints |
| `warehouse_admin` | Scoped to assigned warehouse |
| `store_admin` | Scoped to assigned store |
| `driver` | Own deliveries & location only |
| `unassigned` | No access until role assigned |

---

## 1. Health

### `GET /api/health`

No auth required.

**Response 200:**
```json
{ "status": "ok" }
```

---

## 2. Auth

### `POST /api/auth/register`

No auth required.

**Request:**
```json
{
  "name": "string",
  "email": "string",
  "password": "string"
}
```

**Response 201:**
```json
{
  "token": "jwt_token_string",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "role": "unassigned"
  }
}
```

### `POST /api/auth/login`

No auth required.

**Request:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response 200:**
```json
{
  "token": "jwt_token_string",
  "user": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "role": "warehouse_admin",
    "warehouse": "warehouse_id | null",
    "store": "store_id | null"
  }
}
```

### `GET /api/auth/me`

Auth required. Any role.

**Response 200:**
```json
{
  "_id": "string",
  "name": "string",
  "email": "string",
  "role": "string",
  "warehouse": { "_id": "string", "name": "string" } | null,
  "store": { "_id": "string", "name": "string" } | null
}
```

---

## 3. Users (Superadmin Only)

### `GET /api/users`

Auth: `superadmin`

**Query params:** `?page=1&limit=20&search=john`

**Response 200:**
```json
{
  "users": [
    {
      "_id": "string",
      "name": "string",
      "email": "string",
      "role": "warehouse_admin",
      "warehouse": { "_id": "string", "name": "string" } | null,
      "store": { "_id": "string", "name": "string" } | null,
      "createdAt": "date"
    }
  ],
  "total": 50,
  "page": 1,
  "pages": 3
}
```

### `POST /api/users`

Auth: `superadmin`

**Request:**
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "warehouse_admin | store_admin | driver",
  "warehouse": "warehouse_id | null",
  "store": "store_id | null"
}
```

**Response 201:** `{ "_id", "name", "email", "role", "warehouse", "store" }`

### `PATCH /api/users/:id/role`

Auth: `superadmin`

**Request:**
```json
{
  "role": "driver",
  "warehouse": "warehouse_id | null",
  "store": "store_id | null"
}
```

**Response 200:** Updated user object.

### `DELETE /api/users/:id`

Auth: `superadmin`

**Response 200:** `{ "message": "User deleted" }`

---

## 4. Items

### `GET /api/items`

Auth: Any authenticated user.

**Response 200:**
```json
[
  {
    "_id": "string",
    "name": "Indomie Goreng",
    "sku": "IND-001",
    "unit": "pcs",
    "volumeM3": 0.001,
    "category": "Food",
    "createdAt": "date"
  }
]
```

### `POST /api/items`

Auth: `superadmin`

**Request:**
```json
{
  "name": "string",
  "sku": "string",
  "unit": "pcs | box | kg",
  "volumeM3": 0.001,
  "category": "string"
}
```

**Response 201:** Created item object.

### `PATCH /api/items/:id`

Auth: `superadmin`

**Request:** Any subset of `{ name, unit, volumeM3, category }`

**Response 200:** Updated item object.

### `DELETE /api/items/:id`

Auth: `superadmin`

**Response 200:** `{ "message": "Item deleted" }`

---

## 5. Warehouses

### `GET /api/warehouses`

Auth: `superadmin`, `warehouse_admin`

**Response 200:**
```json
[
  {
    "_id": "string",
    "name": "Warehouse A",
    "address": "Jl. Raya No. 1",
    "coords": { "lat": -6.2, "lng": 106.8 },
    "capacityM3": 1000,
    "areaM2": 500,
    "stores": ["store_id_1", "store_id_2"],
    "utilization": 45.5
  }
]
```

### `POST /api/warehouses`

Auth: `superadmin`

**Request:**
```json
{
  "name": "string",
  "address": "string",
  "coords": { "lat": -6.2, "lng": 106.8 },
  "capacityM3": 1000,
  "areaM2": 500,
  "stores": ["store_id"]
}
```

**Response 201:** Created warehouse object.

### `PATCH /api/warehouses/:id`

Auth: `superadmin`

**Response 200:** Updated warehouse object.

### `DELETE /api/warehouses/:id`

Auth: `superadmin`

**Response 200:** `{ "message": "Warehouse deleted" }`

---

## 6. Stores

### `GET /api/stores`

Auth: `superadmin`, `store_admin`, `warehouse_admin`

**Response 200:**
```json
[
  {
    "_id": "string",
    "name": "Store Alpha",
    "address": "Jl. Sudirman No. 10",
    "coords": { "lat": -6.21, "lng": 106.82 },
    "createdAt": "date"
  }
]
```

### `POST /api/stores`

Auth: `superadmin`

**Request:**
```json
{
  "name": "string",
  "address": "string",
  "coords": { "lat": -6.21, "lng": 106.82 }
}
```

**Response 201:** Created store object.

### `PATCH /api/stores/:id`

Auth: `superadmin`

**Response 200:** Updated store object.

### `DELETE /api/stores/:id`

Auth: `superadmin`

**Response 200:** `{ "message": "Store deleted" }`

---

## 7. Warehouse Stock

### `GET /api/warehouse-stock`

Auth: `superadmin`, `warehouse_admin`

**Query:** `?warehouse=<warehouse_id>` (required)

**Response 200:**
```json
[
  {
    "_id": "string",
    "warehouse": { "_id": "string", "name": "string" },
    "item": { "_id": "string", "name": "string", "sku": "string", "unit": "pcs" },
    "qty": 500,
    "createdAt": "date"
  }
]
```

### `POST /api/warehouse-stock/add`

Auth: `superadmin`

**Request:**
```json
{
  "warehouse": "warehouse_id",
  "item": "item_id",
  "qty": 100
}
```

**Behavior:** Increments existing stock or creates new row. Logs `WAREHOUSE_STOCK_ADDED` + `StockHistory`.

**Response 200:** Updated stock object.

### `PATCH /api/warehouse-stock/:id`

Auth: `superadmin`

**Request:** `{ "qty": 200 }`

**Response 200:** Updated stock object.

### `DELETE /api/warehouse-stock/:id`

Auth: `superadmin`

**Response 200:** `{ "message": "Stock deleted" }`

---

## 8. Store Stock

### `GET /api/store-stock`

Auth: `superadmin`, `warehouse_admin`, `store_admin`

**Query:** `?store=<store_id>` (required)

**Response 200:**
```json
[
  {
    "_id": "string",
    "store": { "_id": "string", "name": "string" },
    "item": { "_id": "string", "name": "string", "sku": "string", "unit": "pcs" },
    "qty": 50,
    "threshold": 10,
    "maxLevel": 200,
    "belowThreshold": true
  }
]
```

### `PATCH /api/store-stock/:id/adjust`

Auth: `store_admin`

**Request:** `{ "qty": 45 }`

**Behavior:** Sets absolute quantity. Logs `STOCK_ADJUSTED` + `StockHistory`.

**Response 200:** Updated stock object.

### `PATCH /api/store-stock/:id/threshold`

Auth: `superadmin`, `warehouse_admin`

**Request:** `{ "threshold": 10 }`

**Response 200:** Updated stock object.

---

## 9. Alerts

### `GET /api/alerts`

Auth: `superadmin`, `warehouse_admin`

**Response 200:**
```json
[
  {
    "_id": "string",
    "store": { "_id": "string", "name": "string" },
    "item": { "_id": "string", "name": "string", "sku": "string" },
    "qty": 3,
    "threshold": 10
  }
]
```

Returns store stock rows where `qty < threshold`.

---

## 10. Boxes

### `POST /api/boxes`

Auth: `warehouse_admin`

**Request:**
```json
{
  "destinationStore": "store_id",
  "items": [
    { "item": "item_id", "qty": 50 }
  ]
}
```

**Behavior:** Decrements warehouse stock, creates box with auto code (`BX-0001`), generates QR, logs `BOX_PACKED`.

**Response 201:**
```json
{
  "box": {
    "_id": "string",
    "code": "BX-0001",
    "qrToken": "uuid-string",
    "warehouse": "warehouse_id",
    "destinationStore": "store_id",
    "items": [{ "item": "item_id", "qty": 50 }],
    "status": "PACKED",
    "assignedDriver": null,
    "expectedArrival": null,
    "createdAt": "date"
  },
  "qrDataUrl": "data:image/png;base64,..."
}
```

### `GET /api/boxes`

Auth: `superadmin`, `warehouse_admin`, `driver`, `store_admin`

**Query:** `?page=1&limit=20&status=PACKED&search=BX-0001&from=2026-07-01&to=2026-07-16`

**Status filter:** `PACKED | ASSIGNED | IN_TRANSIT | DELIVERED`

**Response 200:**
```json
{
  "boxes": [
    {
      "_id": "string",
      "code": "BX-0001",
      "warehouse": { "_id": "string", "name": "string" },
      "destinationStore": { "_id": "string", "name": "string" },
      "items": [{ "item": { "name": "string", "sku": "string" }, "qty": 50 }],
      "status": "PACKED",
      "assignedDriver": null,
      "expectedArrival": null,
      "createdAt": "date"
    }
  ],
  "total": 100,
  "page": 1,
  "pages": 5
}
```

### `GET /api/boxes/:id/qr`

Auth: `warehouse_admin`

**Response 200:**
```json
{
  "qrDataUrl": "data:image/png;base64,..."
}
```

### `POST /api/boxes/:id/assign`

Auth: `warehouse_admin`

**Request:**
```json
{
  "driverId": "user_id",
  "expectedArrival": "2026-07-16T15:00:00Z"
}
```

**Behavior:** Sets status to `ASSIGNED`. Logs `DRIVER_ASSIGNED`.

**Response 200:** Updated box object.

### `PATCH /api/boxes/:id/pickup`

Auth: `driver`

**Request:**
```json
{
  "coords": { "lat": -6.2, "lng": 106.8 }
}
```

**Behavior:** Status `ASSIGNED` -> `IN_TRANSIT`. Logs `PICKED_UP`.

**Response 200:** Updated box object.

---

## 11. Scan (QR Operations)

### `POST /api/scan/driver`

Auth: `warehouse_admin`

**Request:**
```json
{
  "token": "driver-uuid-token",
  "boxIds": ["box_id_1", "box_id_2"],
  "expectedArrival": "2026-07-16T15:00:00Z"
}
```

**Behavior:** Validates driver QR token, assigns all listed `PACKED` boxes to driver, sets status `ASSIGNED`.

**Response 200:**
```json
{
  "message": "2 boxes assigned to driver",
  "assignedBoxes": ["box_id_1", "box_id_2"]
}
```

### `POST /api/scan/box`

Auth: `store_admin`

**Request:**
```json
{
  "token": "box-uuid-token",
  "code": "BX-0001",
  "coords": { "lat": -6.21, "lng": 106.82 }
}
```

**Behavior:** Lookups box by QR token or code, validates destination matches store, auto-increments `StoreStock`, sets status `DELIVERED`, logs `DELIVERED`.

**Response 200:**
```json
{
  "message": "Box delivered successfully",
  "box": {
    "_id": "string",
    "code": "BX-0001",
    "status": "DELIVERED"
  }
}
```

---

## 12. Driver Location

### `POST /api/driver-location`

Auth: `driver`

**Request:**
```json
{
  "coords": { "lat": -6.2, "lng": 106.8 }
}
```

**Response 200:**
```json
{
  "_id": "string",
  "driver": "user_id",
  "name": "Driver Name",
  "coords": { "lat": -6.2, "lng": 106.8 },
  "heading": 0,
  "speedKph": 0,
  "status": "on-route",
  "updatedAt": "date"
}
```

### `GET /api/driver-locations`

Auth: `superadmin`, `warehouse_admin`

**Response 200:**
```json
[
  {
    "_id": "string",
    "driver": { "_id": "string", "name": "string" },
    "coords": { "lat": -6.2, "lng": 106.8 },
    "heading": 45,
    "speedKph": 30,
    "status": "on-route",
    "updatedAt": "date"
  }
]
```

---

## 13. Tracking

### `GET /api/tracking/locations`

Auth: `superadmin`, `warehouse_admin`

**Response 200:**
```json
{
  "warehouses": [
    { "_id": "string", "name": "string", "coords": { "lat": 0, "lng": 0 } }
  ],
  "stores": [
    { "_id": "string", "name": "string", "coords": { "lat": 0, "lng": 0 } }
  ],
  "drivers": [
    {
      "_id": "string",
      "name": "string",
      "coords": { "lat": 0, "lng": 0 },
      "status": "on-route",
      "heading": 45,
      "speedKph": 30
    }
  ]
}
```

### `POST /api/tracking/drivers/:driverId`

Auth: `superadmin`, `warehouse_admin`, `driver`

**Request:**
```json
{
  "name": "string",
  "lat": -6.2,
  "lng": 106.8,
  "heading": 45,
  "speedKph": 30
}
```

**Response 200:** Updated DriverLocation object.

### `POST /api/tracking/drivers/:driverId/status`

Auth: `superadmin`, `warehouse_admin`, `driver`

**Request:** `{ "status": "idle | on-route | delivering | offline" }`

**Response 200:** `{ "status": "on-route" }`

---

## 14. Dashboard

### `GET /api/dashboard/stats`

Auth: `superadmin`

**Response 200:**
```json
{
  "boxStats": { "PACKED": 10, "ASSIGNED": 5, "IN_TRANSIT": 3, "DELIVERED": 100 },
  "totalUsers": 25,
  "lowStockAlerts": 8,
  "warehouseUtilization": 65.5,
  "warehouseFlow": {
    "daily": [{ "date": "2026-07-15", "inbound": 50, "outbound": 30 }],
    "weekly": [],
    "monthly": []
  },
  "stockTurnover": [{ "item": "string", "turnover": 3.5 }],
  "slowMovingItems": [{ "item": "string", "daysSinceLastMovement": 30 }]
}
```

### `GET /api/dashboard/warehouse/driver-performance`

Auth: `warehouse_admin`

**Response 200:**
```json
[
  {
    "driver": { "_id": "string", "name": "string" },
    "deliveries": 15,
    "avgEstimatedMinutes": 45,
    "avgActualMinutes": 42,
    "efficiency": 107.1
  }
]
```

### `GET /api/dashboard/warehouse/stock-availability`

Auth: `warehouse_admin`

**Query:** `?days=30` (default: 30)

**Response 200:**
```json
{
  "warehouseStock": [{ "item": "string", "qty": 500, "unit": "pcs" }],
  "storeStock": [{ "store": "string", "item": "string", "qty": 50, "threshold": 10 }],
  "stockHistory": [{ "date": "2026-07-15", "inbound": 100, "outbound": 50 }],
  "reorderAlerts": [{ "item": "string", "store": "string", "daysUntilEmpty": 5 }]
}
```

---

## 15. Logs

### `GET /api/logs`

Auth: `superadmin`, `warehouse_admin`, `store_admin`

**Query:** `?page=1&limit=20&box=box_id&store=store_id&from=2026-07-01&to=2026-07-16`

**Response 200:**
```json
{
  "logs": [
    {
      "_id": "string",
      "box": { "_id": "string", "code": "BX-0001" } | null,
      "actor": { "_id": "string", "name": "string", "role": "string" },
      "action": "BOX_PACKED | DRIVER_ASSIGNED | PICKED_UP | DELIVERED | STOCK_ADJUSTED | WAREHOUSE_STOCK_ADDED",
      "coords": { "lat": 0, "lng": 0 } | null,
      "meta": {},
      "timestamp": "date"
    }
  ],
  "total": 200,
  "page": 1,
  "pages": 10
}
```

---

## Error Responses

All endpoints return errors in this format:

**400 Bad Request:**
```json
{ "message": "Validation error description" }
```

**401 Unauthorized:**
```json
{ "message": "No token, authorization denied" }
```

**403 Forbidden:**
```json
{ "message": "Access denied" }
```

**404 Not Found:**
```json
{ "message": "Resource not found" }
```

**500 Server Error:**
```json
{ "message": "Server error" }
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Not authorized (wrong role) |
| 404 | Resource not found |
| 500 | Server error |

---

## Box Status Flow

```
PACKED -> ASSIGNED -> IN_TRANSIT -> DELIVERED
```

| Status | Description |
|--------|-------------|
| `PACKED` | Box packed, waiting for driver |
| `ASSIGNED` | Driver assigned, waiting pickup |
| `IN_TRANSIT` | Driver picked up, on the way |
| `DELIVERED` | Scanned at store, stock replenished |

---

## Driver Location Status

| Status | Description |
|--------|-------------|
| `idle` | Not active |
| `on-route` | Driving to destination |
| `delivering` | At store, delivering |
| `offline` | Not connected |
