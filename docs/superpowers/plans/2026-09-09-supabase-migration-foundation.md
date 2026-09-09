# Supabase Migration Foundation Implementation Plan

**Status:** In progress — implementation complete; live database verification requires Docker or a linked Supabase project.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare LogistiQ for a safe MongoDB-to-Supabase/Postgres migration with a normalized schema, RLS boundaries, deterministic source-data validation, and repeatable export/import tooling, while preserving the current Express API until a verified repository cutover.

**Architecture:** Keep Express/Mongoose as the active adapter during this phase. Add a Supabase SQL schema that models the current domain relationally, server-only migration scripts that export and validate Mongo data without deleting it, and an import script that loads a validated snapshot into Postgres in dependency order. Use UUIDs in Postgres, an explicit source-ID mapping, typed constraints, append-only history, and RLS policies based on server-managed profile scope.

**Tech Stack:** PostgreSQL/Supabase SQL, Node.js/CommonJS, Mongoose, `pg`, Jest, Supabase CLI when available.

**Spec:** `docs/superpowers/specs/2026-09-09-supabase-migration-design.md`

## Constraints

- Never commit database URLs, service-role keys, JWT secrets, or exported production data.
- Never expose a Supabase service-role credential to the browser.
- Do not copy Mongo password hashes into `auth.users`.
- Keep the current Mongo adapter and API behavior working until Postgres parity tests pass.
- RLS must be enabled on every exposed application table.
- Migration scripts must be idempotent or fail before making a partial import; source Mongo data must remain untouched.

## Task 1: Stabilize the existing test baseline

**Files:** `server/tests/setup.js`

- [x] Reproduce the intermittent duplicate-email failure in isolation.
- [x] Await all loaded Mongoose model indexes after the test replica set connects.
- [x] Run all server and client tests and record a clean baseline.

## Task 2: Add the normalized Supabase schema and RLS

**Files:**

- Create: `supabase/migrations/<generated>_create_logistiq_schema.sql`
- Create: `supabase/tests/rls.sql`

- [x] Create enums, tables, foreign keys, uniqueness rules, quantity checks, coordinate checks, timestamps, and indexes.
- [x] Replace embedded box items with `box_items` and warehouse store arrays with `stores.warehouse_id`.
- [x] Add profiles linked to `auth.users` without password columns.
- [x] Add private authorization helper functions with a fixed `search_path` and restricted execute permissions.
- [x] Enable RLS on all public application tables and add scope-aware policies for superadmins, warehouse admins, store admins, and drivers.
- [x] Add executable pgTAP checks for RLS coverage, authenticated-only policies, private helpers, and identity separation.

## Task 3: Add safe migration configuration and package support

**Files:**

- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/.env.example`
- Create: `supabase/.gitignore`
- Modify: `README.md`

- [x] Add `pg` as a server dependency and a small configuration helper that refuses to start migration commands without an explicit database URL.
- [x] Document direct/session/transaction pooler choices and server-only credential handling.
- [x] Ignore local Supabase state and all export snapshots.
- [x] Document the required Auth-user mapping and the fact that password reset/invite is required.

## Task 4: Build deterministic Mongo export and preflight validation

**Files:**

- Create: `server/scripts/export-mongo-for-supabase.js`
- Create: `server/scripts/validate-mongo-export.js`
- Create: `server/scripts/migration-data.js`
- Create: `server/tests/scripts/migration-data.test.js`

- [x] Export each collection as JSONL plus a source-ID map and manifest counts.
- [x] Reject duplicate emails, SKUs, box codes/QR tokens, stock pairs, and driver locations.
- [x] Reject dangling references, stores assigned to multiple warehouses, invalid role/scope combinations, invalid coordinates/dates, and negative/fractional quantities where the domain requires integers.
- [x] Ensure validation has no write side effects and produces actionable error paths.
- [x] Test representative valid and invalid snapshots without requiring a live database.

## Task 5: Build a guarded Postgres import and parity checks

**Files:**

- Create: `server/scripts/import-supabase.js`
- Create: `server/scripts/verify-supabase-import.js`
- Create: `server/tests/scripts/supabase-import.test.js`

- [x] Require a validated manifest and explicit `SUPABASE_DB_URL` before importing.
- [x] Load master data first, then profiles/ID mappings, stocks, boxes/box items, logs, history, and locations inside a transaction.
- [x] Use generated UUIDs and preserve source IDs only in a private mapping table or manifest, never as public primary keys.
- [x] Use parameterized queries and rollback on any error.
- [x] Verify counts, relationship coverage, stock totals, box item totals, and orphan counts after import.

## Task 6: Verify the foundation and hand off cutover prerequisites

- [x] Run server tests, client tests, schema/static checks, and migration-script tests.
- [ ] Run Supabase CLI lint/tests when Docker or a linked Supabase database is available; current local check is blocked by PostgreSQL not listening on `127.0.0.1:54322`.
- [x] Review the diff for secrets, production data, unsafe RLS policies, and accidental API changes.
- [x] Document the remaining project-specific cutover steps in the design spec and README.
