-- LogistiQ relational schema for Supabase/Postgres.
-- This migration intentionally does not create or modify auth.users passwords.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.app_role as enum ('superadmin', 'warehouse_admin', 'store_admin', 'driver', 'unassigned');
create type public.item_unit as enum ('pcs', 'box', 'kg');
create type public.box_status as enum ('PACKED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED');
create type public.handover_action as enum ('BOX_PACKED', 'DRIVER_ASSIGNED', 'PICKED_UP', 'DELIVERED', 'STOCK_ADJUSTED', 'WAREHOUSE_STOCK_ADDED');
create type public.stock_reason as enum ('INITIAL', 'RESTOCK', 'TRANSFER_OUT', 'TRANSFER_IN', 'DELIVERY', 'ADJUSTMENT', 'RETURN', 'ASSIGNMENT', 'RECEIVED');
create type public.driver_status as enum ('idle', 'on-route', 'delivering', 'offline');

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  address text not null default '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  capacity numeric(14,3) not null default 0 check (capacity >= 0),
  area numeric(14,3) not null default 0 check (area >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint warehouses_longitude_check check (longitude is null or longitude between -180 and 180)
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  address text not null default '',
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stores_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint stores_longitude_check check (longitude is null or longitude between -180 and 180)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sku text not null unique check (sku = upper(trim(sku)) and length(trim(sku)) > 0),
  unit public.item_unit not null,
  volume_m3 numeric(14,6) not null default 0 check (volume_m3 >= 0),
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text not null unique check (email = lower(trim(email))),
  role public.app_role not null default 'unassigned',
  warehouse_id uuid references public.warehouses(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  driver_qr_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_scope_check check (
    (role = 'warehouse_admin' and warehouse_id is not null and store_id is null)
    or (role = 'store_admin' and store_id is not null and warehouse_id is null)
    or (role in ('superadmin', 'driver', 'unassigned') and warehouse_id is null and store_id is null)
  )
);

create table public.warehouse_stocks (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(14,3) not null default 0 check (qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, item_id)
);

create table public.store_stocks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(14,3) not null default 0 check (qty >= 0),
  threshold numeric(14,3) not null default 0 check (threshold >= 0),
  max_level numeric(14,3) not null default 0 check (max_level >= threshold),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, item_id)
);

create table public.boxes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (length(trim(code)) > 0),
  qr_token text not null unique check (length(trim(qr_token)) > 0),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  destination_store_id uuid not null references public.stores(id) on delete restrict,
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  status public.box_status not null default 'PACKED',
  expected_arrival timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.box_items (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references public.boxes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric(14,3) not null check (qty > 0),
  created_at timestamptz not null default now(),
  unique (box_id, item_id)
);

create table public.handover_logs (
  id uuid primary key default gen_random_uuid(),
  box_id uuid references public.boxes(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action public.handover_action not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint handover_logs_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint handover_logs_longitude_check check (longitude is null or longitude between -180 and 180)
);

create table public.stock_history (
  id uuid primary key default gen_random_uuid(),
  stock_type text not null check (stock_type in ('warehouse', 'store')),
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  store_id uuid references public.stores(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  qty_snapshot numeric(14,3) not null check (qty_snapshot >= 0),
  change_delta numeric(14,3) not null,
  reason public.stock_reason not null,
  actor_id uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stock_history_location_check check (
    (stock_type = 'warehouse' and warehouse_id is not null and store_id is null)
    or (stock_type = 'store' and store_id is not null and warehouse_id is null)
  )
);

create table public.driver_locations (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.profiles(id) on delete cascade,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  heading numeric(7,3),
  speed numeric(10,3),
  status public.driver_status not null default 'idle',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint driver_locations_latitude_check check (latitude between -90 and 90),
  constraint driver_locations_longitude_check check (longitude between -180 and 180),
  constraint driver_locations_heading_check check (heading is null or heading between 0 and 360),
  constraint driver_locations_speed_check check (speed is null or speed >= 0)
);

create table private.mongo_id_map (
  source_collection text not null,
  source_id text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (source_collection, source_id),
  unique (source_collection, target_id)
);

create index stores_warehouse_id_idx on public.stores (warehouse_id);
create index profiles_warehouse_id_idx on public.profiles (warehouse_id);
create index profiles_store_id_idx on public.profiles (store_id);
create index boxes_status_idx on public.boxes (status);
create index boxes_warehouse_status_idx on public.boxes (warehouse_id, status);
create index boxes_destination_status_idx on public.boxes (destination_store_id, status);
create index boxes_driver_status_idx on public.boxes (assigned_driver_id, status);
create index box_items_item_id_idx on public.box_items (item_id);
create index handover_logs_box_occurred_idx on public.handover_logs (box_id, occurred_at desc);
create index handover_logs_actor_occurred_idx on public.handover_logs (actor_id, occurred_at desc);
create index stock_history_warehouse_item_time_idx on public.stock_history (warehouse_id, item_id, occurred_at desc);
create index stock_history_store_item_time_idx on public.stock_history (store_id, item_id, occurred_at desc);
create index driver_locations_status_idx on public.driver_locations (status);

create or replace function private.enforce_item_quantity_precision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  item_unit public.item_unit;
begin
  select unit into item_unit from public.items where id = new.item_id;
  if item_unit is null then
    raise exception 'item % does not exist', new.item_id using errcode = '23503';
  end if;
  if item_unit in ('pcs', 'box') then
    if new.qty <> trunc(new.qty) then
      raise exception 'quantity for % items must be an integer', item_unit using errcode = '23514';
    end if;
    if tg_table_name = 'store_stocks' and (new.threshold <> trunc(new.threshold) or new.max_level <> trunc(new.max_level)) then
      raise exception 'threshold and max_level for % items must be integers', item_unit using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger warehouse_stocks_quantity_precision
before insert or update on public.warehouse_stocks
for each row execute function private.enforce_item_quantity_precision();

create trigger store_stocks_quantity_precision
before insert or update on public.store_stocks
for each row execute function private.enforce_item_quantity_precision();

create trigger box_items_quantity_precision
before insert or update on public.box_items
for each row execute function private.enforce_item_quantity_precision();

create or replace function private.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function private.current_profile_warehouse()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select warehouse_id from public.profiles where id = auth.uid();
$$;

create or replace function private.current_profile_store()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select store_id from public.profiles where id = auth.uid();
$$;

create or replace function private.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(private.current_profile_role() = 'superadmin', false);
$$;

revoke all on function private.current_profile_role() from public;
revoke all on function private.current_profile_warehouse() from public;
revoke all on function private.current_profile_store() from public;
revoke all on function private.is_superadmin() from public;
grant execute on function private.current_profile_role() to authenticated;
grant execute on function private.current_profile_warehouse() to authenticated;
grant execute on function private.current_profile_store() to authenticated;
grant execute on function private.is_superadmin() to authenticated;

alter table public.warehouses enable row level security;
alter table public.stores enable row level security;
alter table public.items enable row level security;
alter table public.profiles enable row level security;
alter table public.warehouse_stocks enable row level security;
alter table public.store_stocks enable row level security;
alter table public.boxes enable row level security;
alter table public.box_items enable row level security;
alter table public.handover_logs enable row level security;
alter table public.stock_history enable row level security;
alter table public.driver_locations enable row level security;

create policy warehouses_select on public.warehouses for select to authenticated
using (private.is_superadmin() or id = private.current_profile_warehouse());
create policy warehouses_manage on public.warehouses for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

create policy stores_select on public.stores for select to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or id = private.current_profile_store());
create policy stores_manage on public.stores for all to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse())
with check (private.is_superadmin() or warehouse_id = private.current_profile_warehouse());

create policy items_select on public.items for select to authenticated using (true);
create policy items_manage on public.items for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

create policy profiles_select on public.profiles for select to authenticated
using (private.is_superadmin() or id = auth.uid() or warehouse_id = private.current_profile_warehouse() or store_id = private.current_profile_store());
create policy profiles_manage on public.profiles for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

create policy warehouse_stocks_select on public.warehouse_stocks for select to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse());
create policy warehouse_stocks_manage on public.warehouse_stocks for all to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse())
with check (private.is_superadmin() or warehouse_id = private.current_profile_warehouse());

create policy store_stocks_select on public.store_stocks for select to authenticated
using (private.is_superadmin() or store_id = private.current_profile_store() or store_id in (select id from public.stores where warehouse_id = private.current_profile_warehouse()));
create policy store_stocks_manage on public.store_stocks for all to authenticated
using (private.is_superadmin() or store_id = private.current_profile_store() or store_id in (select id from public.stores where warehouse_id = private.current_profile_warehouse()))
with check (private.is_superadmin() or store_id = private.current_profile_store() or store_id in (select id from public.stores where warehouse_id = private.current_profile_warehouse()));

create policy boxes_select on public.boxes for select to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or destination_store_id = private.current_profile_store() or assigned_driver_id = auth.uid());
create policy boxes_insert on public.boxes for insert to authenticated
with check (private.is_superadmin() or warehouse_id = private.current_profile_warehouse());
create policy boxes_update on public.boxes for update to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or destination_store_id = private.current_profile_store() or assigned_driver_id = auth.uid())
with check (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or destination_store_id = private.current_profile_store() or assigned_driver_id = auth.uid());

create policy box_items_select on public.box_items for select to authenticated
using (exists (select 1 from public.boxes b where b.id = box_id and (private.is_superadmin() or b.warehouse_id = private.current_profile_warehouse() or b.destination_store_id = private.current_profile_store() or b.assigned_driver_id = auth.uid())));
create policy box_items_manage on public.box_items for all to authenticated
using (exists (select 1 from public.boxes b where b.id = box_id and (private.is_superadmin() or b.warehouse_id = private.current_profile_warehouse())))
with check (exists (select 1 from public.boxes b where b.id = box_id and (private.is_superadmin() or b.warehouse_id = private.current_profile_warehouse())));

create policy handover_logs_select on public.handover_logs for select to authenticated
using (private.is_superadmin() or actor_id = auth.uid() or exists (select 1 from public.boxes b where b.id = box_id and (b.warehouse_id = private.current_profile_warehouse() or b.destination_store_id = private.current_profile_store())));
create policy handover_logs_insert on public.handover_logs for insert to authenticated
with check (actor_id = auth.uid() or private.is_superadmin());

create policy stock_history_select on public.stock_history for select to authenticated
using (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or store_id = private.current_profile_store());
create policy stock_history_insert on public.stock_history for insert to authenticated
with check (private.is_superadmin() or warehouse_id = private.current_profile_warehouse() or store_id = private.current_profile_store());

create policy driver_locations_select on public.driver_locations for select to authenticated
using (private.is_superadmin() or driver_id = auth.uid() or driver_id in (select id from public.profiles where warehouse_id = private.current_profile_warehouse()));
create policy driver_locations_manage on public.driver_locations for all to authenticated
using (private.is_superadmin() or driver_id = auth.uid())
with check (private.is_superadmin() or driver_id = auth.uid());
