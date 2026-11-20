-- Review #20 (21 Nov 2026): make sure EVERY table in the public schema has Row Level Security on.
--
-- WHY: Supabase puts a public REST endpoint in front of every table. RLS ON with no policy means
-- only the database owner — the API, which connects as the owner — can read or write the table;
-- the public endpoint sees nothing. The MealLog table (meal tracker) was added after the original
-- security pass and has no RLS statement in the repo, so it may be readable through that endpoint.
--
-- WHAT THIS CHANGES: only switches RLS on for tables that have it off. It adds no policy, drops
-- nothing, deletes nothing, and does not affect the API (the owner role bypasses RLS).
--
-- SAFE TO RUN TWICE: tables that already have RLS on are skipped.
-- RUN IT: Supabase dashboard → SQL Editor → paste this whole file → Run.
--
-- UNDO (one table): ALTER TABLE "public"."<TableName>" DISABLE ROW LEVEL SECURITY;

-- 0. BEFORE: which tables have RLS off right now? (Save this result — it is your undo list.)
SELECT tablename AS rls_off_before
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
ORDER BY tablename;

-- 1. Switch it on wherever it is off.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', t.tablename);
    RAISE NOTICE 'RLS enabled on %', t.tablename;
  END LOOP;
END $$;

-- 2. CHECK: this must return ZERO rows.
SELECT tablename AS still_rls_off
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- 3. CHECK: the meal tracker table specifically (expect rowsecurity = true, or no row if the
--    table has not been created yet).
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'MealLog';

-- 4. CHECK: table rights the public roles hold on MealLog. Supabase grants these by default on new
--    tables; with RLS on (step 1) and no policy they still cannot read a single row. The repo's
--    security test (supabase/tests/database/security.test.sql) expects them revoked, as was done
--    for the older tables. If rows appear here and you want to match that, run the OPTIONAL line.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'MealLog' AND grantee IN ('anon', 'authenticated');
-- OPTIONAL (safe to run twice; undo: GRANT ALL ON "public"."MealLog" TO anon, authenticated;):
-- REVOKE ALL ON "public"."MealLog" FROM anon, authenticated;
