# Database migrations — baseline (review #20, 21 Nov 2026)

Until now the schema was applied with `prisma db push`, which keeps no history: there was no record
of what changed when, and no way to replay or review a change before it reached production.

`0_init/migration.sql` is a **baseline**: the full schema as `schema.prisma` describes it today,
generated offline (`prisma migrate diff --from-empty --to-schema-datamodel`). It was **not** run
anywhere. Nothing in the build or deploy runs migrations, so adding this folder changes nothing live.

## Owner steps (once, when you are ready — needs the production DATABASE_URL in your shell)

1. **See whether production matches the schema** (read-only, changes nothing):
   ```
   cd apps/api
   npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
   ```
   An empty result means production matches. Anything printed is drift: send it to the developer
   before going further. (Tables made outside Prisma — `OpsRecord`, the demand tables — are not in
   the schema and will show up; that is expected.)
2. **Mark the baseline as already applied** (adds one row to the `_prisma_migrations` table; does
   not touch any other table):
   ```
   npx prisma migrate resolve --applied 0_init
   ```
3. From then on, schema changes are made with `npx prisma migrate dev --name <change>` locally and
   applied with `npx prisma migrate deploy` — each change reviewed as a file in a PR.

**Undo for step 2:** `DELETE FROM "_prisma_migrations" WHERE migration_name = '0_init';`
