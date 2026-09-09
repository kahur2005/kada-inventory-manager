# Supabase/Postgres Migration Design

**Date:** 2026-09-09
**Status:** Approved for implementation

## Decision

Keep the Express API and its response shapes stable while moving persistence from Mongoose/MongoDB to Supabase Postgres. Supabase Auth becomes the identity source in a later cutover step; application profiles hold role and warehouse/store scope and are keyed by `auth.users.id`. The browser continues calling the Express API during the first migration phase, so the Supabase service credential is never exposed to the client.

## Relational model

- `profiles`: one row per Supabase Auth user; role and scope foreign keys are server-managed.
- `warehouses` and `stores`: a store has one `warehouse_id`, replacing the warehouse-side ObjectId array.
- `items`: unique uppercase SKU and a constrained unit.
- `warehouse_stocks` and `store_stocks`: one row per location/item, with numeric quantities and database checks.
- `boxes` and `box_items`: box header plus one row per item, replacing embedded item documents.
- `handover_logs`: typed event columns plus JSONB metadata for forward-compatible details.
- `stock_history`: append-only quantity ledger with explicit location and reason.
- `driver_locations`: one current location row per driver.

All application tables are protected by RLS. The first API cutover will use a server-side database role/connection, while the policies establish safe boundaries for any future direct Supabase Data API access. Authorization decisions use server-managed profile data or JWT app claims, never editable user metadata.

## Identity and ID migration

Mongo ObjectIds are not reused as Postgres UUIDs. The export includes a stable mapping for every source collection. The import creates parent records first, then writes relationships using the mapping. Existing password hashes are not copied into `auth.users`; users must be provisioned through Supabase Auth or an explicitly supported password-reset/invite flow.

## Atomic business operations

The eventual Postgres repository must execute these transitions in one database transaction (or one private RPC):

1. Pack a box: validate/merge lines, decrement warehouse stock, create box and box items, and write the packing log/history.
2. Deliver a box: claim only an eligible box, increment store stock, mark delivered, and write delivery log/history.
3. Stock adjustments: update the current row and append a history row together.

The migration foundation supplies constraints and an auditable ledger first; the API adapter can be enabled only after its repository contract has parity tests.

## Cutover sequence

1. Apply schema and RLS in a non-production Supabase project.
2. Run Mongo export and reject the export if duplicate keys, dangling references, invalid scopes, invalid coordinates, or invalid quantities are found.
3. Provision Auth users and capture the Mongo-user-to-Supabase-user UUID mapping.
4. Import master data, stocks, boxes, logs, history, and driver locations in dependency order.
5. Run parity checks for counts, relationships, quantities, and recent operational records.
6. Enable the Postgres repository behind a server-side feature flag and run read-only shadow comparisons.
7. Switch writes, monitor, then retire Mongo only after rollback criteria are satisfied.

## Non-goals for this phase

- Direct browser access to tables.
- Automatic password-hash import into Supabase Auth.
- Destructive deletion of Mongo data.
- Claiming a production cutover without a Supabase project and credentials.
