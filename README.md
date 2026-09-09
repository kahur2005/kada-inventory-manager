# LogistiQ

Multi-warehouse stock & delivery tracking system.

## Setup

1. `npm install` (root) — installs `concurrently`
2. `cd server && npm install && cp .env.example .env` — fill in `MONGO_URI` (MongoDB Atlas) and `JWT_SECRET`
3. `cd client && npm install && cp .env.example .env` (optional for local development; the client defaults to `/api` and Vite proxies it to port 5000)
4. From repo root: `npm run dev` — runs server (port 5000) and client (port 5173) together

## Testing

- `npm run test:server` — Jest + Supertest + mongodb-memory-server (no real DB needed)
- `npm run test:client` — Vitest + React Testing Library

## Supabase migration foundation

The repository now includes a normalized Postgres schema and guarded migration tooling. Apply the generated SQL migration to a non-production Supabase project first, then export and validate Mongo data locally:

```powershell
npx supabase link --project-ref <project-ref>
npx supabase db push
npm run migration:export --prefix server -- .migration-export\snapshot
npm run migration:validate --prefix server -- .migration-export\snapshot
```

The export command never deletes Mongo data and returns a non-zero status when preflight finds duplicate keys, dangling references, invalid scopes, coordinates, dates, or quantities. Import additionally requires `SUPABASE_DB_URL` and a JSON mapping from each Mongo user `_id` to a provisioned Supabase `auth.users.id`; it does not migrate password hashes. Run `npm run migration:import --prefix server -- <export-dir> <auth-map.json>` only after the manifest is valid. `npm run migration:verify --prefix server` checks row counts and orphan relationships.

Use a server-only Supabase Postgres connection. Do not put the database URL or a service-role credential in `client/.env`, browser code, or committed files. The current Express/Mongo adapter remains active until a separate parity-tested repository cutover.

For long-running Node processes and migration scripts, use Supabase’s direct connection or session pooler. For short-lived/serverless requests, use the transaction pooler on port `6543` and avoid session-dependent features such as prepared statements.

## Seeding

`npm run seed` (added in Plan 4) populates demo data: 1 superadmin, 1 warehouse_admin, 1 store_admin, 1 driver, 2 warehouses, 3 stores, ~10 items, stock rows.

## Demo deploy (ngrok)

Camera access (`getUserMedia`, used by `/warehouse/assign` and `/store/scan`) requires HTTPS on any origin that isn't `localhost` — a phone on the same network hitting your laptop's LAN IP over plain HTTP will have its camera permission silently denied. ngrok gives the client an HTTPS URL that tunnels to your local Vite dev server.

1. Run the app normally: `npm run dev` (from repo root).
2. In a separate terminal: `ngrok http 5173` (tunnels the client; the client's `VITE_API_URL` still points at your machine's `http://localhost:5000/api`, which is fine as long as the browser doing the scanning is *this* machine — for a phone, see step 3).
3. For a phone to hit the API too, tunnel the server as well: `ngrok http 5000`, then update `client/.env`'s `VITE_API_URL` to that tunnel's HTTPS URL + `/api`, and restart `npm run dev --prefix client` so Vite picks up the new env var.
4. Test the phone camera flow **at least a day before the demo**, not on demo day — this is the PRD's #1 listed risk (Section 9).
5. If the camera still fails during the actual demo: every scan screen has a manual fallback (driver dropdown on `/warehouse/assign`, box-code text input on `/store/scan`) — use it and keep going.
