# LogistiQ

Multi-warehouse stock & delivery tracking system.

## Setup

1. `npm install` (root) — installs `concurrently`
2. `cd server && npm install && cp .env.example .env` — fill in `MONGO_URI` (MongoDB Atlas) and `JWT_SECRET`
3. `cd client && npm install && cp .env.example .env`
4. From repo root: `npm run dev` — runs server (port 5000) and client (port 5173) together

## Testing

- `npm run test:server` — Jest + Supertest + mongodb-memory-server (no real DB needed)
- `npm run test:client` — Vitest + React Testing Library

## Seeding

`npm run seed` (added in Plan 4) populates demo data: 1 superadmin, 1 warehouse_admin, 1 store_admin, 1 driver, 2 warehouses, 3 stores, ~10 items, stock rows.

## Demo deploy

Local + ngrok HTTPS tunnel (phone camera access requires HTTPS for `getUserMedia`). Test the tunnel well before the demo — see Plan 4.
