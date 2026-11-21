// Check cookbook dish files against the schema: node scripts/check-cookbook.mjs [file ...]
// With no files, checks every file in src/lib/cookbook-data/dishes together (ids and aliases must
// be unique across all of them).
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, '../src/lib/cookbook-data');
const { ING } = await import(pathToFileURL(resolve(dataDir, 'ingredients.js')).href);
const { checkDishes } = await import(pathToFileURL(resolve(dataDir, 'schema.js')).href);

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => resolve(f))
  : readdirSync(resolve(dataDir, 'dishes'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => resolve(dataDir, 'dishes', f));

const all = [];
for (const f of files) {
  const mod = await import(pathToFileURL(f).href);
  const list = Object.values(mod).find(Array.isArray);
  if (!list) {
    console.error(`${f}: exports no dish array`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${f.split('/').pop()}: ${list.length} dishes`);
  all.push(...list);
}
const problems = checkDishes(all, ING);
for (const p of problems) console.error('  ✗ ' + p);
console.log(
  problems.length
    ? `${problems.length} problem(s) in ${all.length} dishes`
    : `OK — ${all.length} dishes, no problems`,
);
if (problems.length) process.exitCode = 1;
