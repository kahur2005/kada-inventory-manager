# LogistiQ

Multi-warehouse stock & delivery tracking. Manage warehouses, stores, drivers, and track shipments — all in one place.

## Why This Exists

Tracking stock and deliveries across multiple warehouses and stores is a pain. Without a system:

- **Stock discrepancies** — items go missing, nobody knows where or when
- **No real-time visibility** — managers are always guessing, never sure what's in stock
- **Manual handoffs** — drivers pick up goods with paper lists, errors happen constantly
- **Accountability gap** — when something breaks, no one knows who's responsible

LogistiQ fixes this by giving every role (superadmin, warehouse admin, store admin, driver) a clear view of what's theirs — with QR scanning, real-time stock updates, and delivery tracking baked in.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Express + MongoDB (Mongoose)
- **Auth:** JWT + bcrypt

## Quick Start

```bash
npm install                  # install concurrently
cd logistiq-backend && npm install
cd ../logistiq-frontend && npm install
cd ..                       # back to root
cp logistiq-backend/.env.example logistiq-backend/.env
# fill in MONGO_URI and JWT_SECRET
npm run dev                  # runs server (5000) + client (5173)
```

## Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Run both server & client |
| `npm run seed` | Load demo data (users, warehouses, stores, items, stock) |
| `npm run test:server` | Run server tests (Jest + in-memory Mongo) |
| `npm run test:client` | Run client tests (Vitest) |

## Demo with Phone (ngrok)

Camera features need HTTPS. Use ngrok to expose your local server:

1. `npm run dev` (start app normally)
2. `ngrok http 5173` (expose client)
3. For phone API access: `ngrok http 5000`, then update `VITE_API_URL` in `client/.env` and restart the client

**Test camera on your phone before demo day — don't wait until last minute.**

If camera fails during demo, every scan screen has a manual fallback (dropdown or text input).
