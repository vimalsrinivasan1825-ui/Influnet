#!/usr/bin/env node
/**
 * Apply a single migration file to the linked Supabase project and record it in
 * supabase_migrations.schema_migrations.
 *
 * `supabase db push` is the normal route; this exists for the case that route
 * can't be used (CLI version pinning issues, or applying one file out of band
 * on a dev database). It is deliberately explicit about WHICH file it runs and
 * refuses to guess.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local scripts/apply-migration.mjs 113
 *   node --env-file=apps/web/.env.local scripts/apply-migration.mjs 113 --dry-run
 *
 * Requires SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql, lit, PROJECT_REF } from '../tests/e2e/lib/sql.mjs';

const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url).pathname;

const version = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!version) {
  console.error('Usage: apply-migration.mjs <version> [--dry-run]');
  process.exit(1);
}

const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(`${version}_`));
if (!file) {
  console.error(`No migration file starting with "${version}_" in supabase/migrations/`);
  process.exit(1);
}

const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');

console.log(`project : ${PROJECT_REF}`);
console.log(`file    : ${file}`);
console.log(`version : ${version}`);
console.log(`name    : ${name}`);
console.log(`bytes   : ${body.length}`);

const already = await sql(
  `select version from supabase_migrations.schema_migrations where version = ${lit(version)}`);
if (already.length) {
  console.log(`\nAlready recorded as applied. Re-running the file anyway is usually safe ` +
              `(migrations here are CREATE OR REPLACE / IF NOT EXISTS), but nothing is ` +
              `recorded twice.`);
}

if (dryRun) {
  console.log('\n--dry-run: not executing.');
  process.exit(0);
}

await sql(body);
console.log('\nSQL applied.');

await sql(
  `insert into supabase_migrations.schema_migrations (version, name)
   values (${lit(version)}, ${lit(name)})
   on conflict (version) do nothing`);
console.log('Recorded in supabase_migrations.schema_migrations.');
