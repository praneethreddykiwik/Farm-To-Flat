-- pgTAP security invariants for the Fooducia database.
--
-- These assert the properties the live pentest verified by hand, so a future migration can't quietly
-- undo them: every table in the public schema must have Row Level Security ENABLED (the default-deny
-- posture that keeps the anon key from reading another customer's rows), and the anon/authenticated
-- roles must not hold blanket table privileges.
--
-- Run locally against a database that has the schema applied:
--   supabase test db                        # Supabase CLI, picks up supabase/tests/**/*.sql
-- or directly with psql on a DB that has pgTAP installed:
--   psql "$DATABASE_URL" -c 'create extension if not exists pgtap;'
--   psql "$DATABASE_URL" -f supabase/tests/database/security.test.sql

begin;
select plan(3);

-- 1. Every table in public has RLS enabled. is_empty => the "offending tables" query returns nothing.
select is_empty(
  $$ select tablename from pg_tables
       where schemaname = 'public' and rowsecurity = false $$,
  'every public table has row level security enabled'
);

-- 2. Every RLS-enabled table actually has at least one policy (RLS with no policy = deny-all, which is
--    safe, but usually a mistake — we want intentional policies, not an accidental lockout).
select is_empty(
  $$ select t.tablename
       from pg_tables t
       where t.schemaname = 'public' and t.rowsecurity = true
         and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = t.tablename
         ) $$,
  'every RLS-enabled public table has at least one policy'
);

-- 3. The anonymous role has no blanket write grant on public tables (reads may be allowed and are
--    still gated by RLS; a direct INSERT/UPDATE/DELETE grant to anon would be a real exposure).
select is_empty(
  $$ select table_name
       from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE') $$,
  'anon role has no write privileges on public tables'
);

select * from finish();
rollback;
