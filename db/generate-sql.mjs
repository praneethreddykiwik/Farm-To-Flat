// Regenerates db/schema.sql from the single source of truth (db/schema.js).
// Usage: node db/generate-sql.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import schema from './schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const header =
  '-- GENERATED from db/schema.js — do not edit by hand. Regenerate: node db/generate-sql.mjs\n\n';
writeFileSync(join(here, 'schema.sql'), header + schema.SCHEMA_SQL);
console.log('wrote db/schema.sql');
