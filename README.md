# LogistiQ

Multi-warehouse stock & delivery tracking system.

## Setup

1. `npm install` (root) — installs `concurrently`
2. `cd logistiq-backend && npm install && cp .env.example .env` — fill in `MONGO_URI` (MongoDB Atlas) and `JWT_SECRET`
3. `cd logistiq-frontend && npm install && cp .env.example .env`
4. From repo root: `npm run dev` — runs server (port 5000) and client (port 5173) together

## Testing

- `npm run test:server` — Jest + Supertest + mongodb-memory-server (no real DB needed)
- `npm run test:client` — Vitest + React Testing Library

## Seeding

`npm run seed` (added in Plan 4) populates demo data: 1 superadmin, 1 warehouse_admin, 1 store_admin, 1 driver, 2 warehouses, 3 stores, ~10 items, stock rows.

## Demo deploy (ngrok)

Camera access (`getUserMedia`, used by `/warehouse/assign` and `/store/scan`) requires HTTPS on any origin that isn't `localhost` — a phone on the same network hitting your laptop's LAN IP over plain HTTP will have its camera permission silently denied. ngrok gives the client an HTTPS URL that tunnels to your local Vite dev server.

1. Run the app normally: `npm run dev` (from repo root).
2. In a separate terminal: `ngrok http 5173` (tunnels the client; the client's `VITE_API_URL` still points at your machine's `http://localhost:5000/api`, which is fine as long as the browser doing the scanning is *this* machine — for a phone, see step 3).
3. For a phone to hit the API too, tunnel the server as well: `ngrok http 5000`, then update `client/.env`'s `VITE_API_URL` to that tunnel's HTTPS URL + `/api`, and restart `npm run dev --prefix logistiq-frontend` so Vite picks up the new env var.
4. Test the phone camera flow **at least a day before the demo**, not on demo day — this is the PRD's #1 listed risk (Section 9).
5. If the camera still fails during the actual demo: every scan screen has a manual fallback (driver dropdown on `/warehouse/assign`, box-code text input on `/store/scan`) — use it and keep going.
