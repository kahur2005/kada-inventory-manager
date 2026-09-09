begin;

select plan(23);

select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'warehouses'), 'RLS enabled on warehouses');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'stores'), 'RLS enabled on stores');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'items'), 'RLS enabled on items');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'profiles'), 'RLS enabled on profiles');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'warehouse_stocks'), 'RLS enabled on warehouse_stocks');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'store_stocks'), 'RLS enabled on store_stocks');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'boxes'), 'RLS enabled on boxes');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'box_items'), 'RLS enabled on box_items');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'handover_logs'), 'RLS enabled on handover_logs');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'stock_history'), 'RLS enabled on stock_history');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'driver_locations'), 'RLS enabled on driver_locations');

select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'warehouses_select' and roles = array['authenticated']), 'warehouse policy is authenticated-only');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'stores_select' and roles = array['authenticated']), 'store policy is authenticated-only');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'boxes_select' and roles = array['authenticated']), 'box policy is authenticated-only');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'box_items_select' and roles = array['authenticated']), 'box-item policy is authenticated-only');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'handover_logs_insert' and roles = array['authenticated']), 'handover insert is authenticated-only');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'stock_history_insert' and roles = array['authenticated']), 'history insert is authenticated-only');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and 'anon' = any(roles)), 'no application policy grants anon access');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'current_profile_role'), 'role helper is private');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'current_profile_warehouse'), 'warehouse helper is private');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'current_profile_store'), 'store helper is private');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('password', 'password_hash')), 'profiles has no password column');
select ok(exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = 'mongo_id_map'), 'source id map is private');

select * from finish();
rollback;
