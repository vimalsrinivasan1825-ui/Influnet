#!/usr/bin/env node
/**
 * Refuse to ship a mobile build whose "production" profile is not production.
 *
 * ── Why this script exists ───────────────────────────────────────────────
 * `eas.json`'s `production` profile currently points at the STAGING backend:
 * staging.influnet.io and the staging Supabase project. That is deliberate
 * today — there is no production tier yet — and it is completely invisible at
 * the moment it matters, which is the moment someone runs
 * `eas build --profile production` and uploads the result to a store.
 *
 * At that point real users on the App Store are writing to staging's database,
 * and the only way to fix it is another store review cycle. JSON has no
 * comments, so the warning cannot live in eas.json itself. It lives here, and
 * it is enforced rather than written down.
 *
 * ── How to satisfy it ────────────────────────────────────────────────────
 * Point the production profile at the real production backend once it exists
 * (HANDOVER P0.1–P0.4). Until then this script is SUPPOSED to fail, and
 * failing is the correct outcome — it means nothing can reach a store by
 * accident.
 *
 * Usage:  node scripts/check-mobile-production-target.mjs
 * Exit 0 = safe to build. Exit 1 = do not ship.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const easPath = resolve(here, '..', 'apps', 'mobile', 'eas.json');

/** Backends that are definitively NOT production. */
const NON_PRODUCTION = [
  { needle: 'aokdansyqxracuwsosji', what: 'the STAGING Supabase project' },
  { needle: 'jaajosocopoicmqcffuu', what: 'the DEV Supabase project' },
  { needle: 'staging.influnet.io', what: 'the STAGING API' },
  { needle: 'dev.influnet.io', what: 'the DEV API' },
  { needle: '192.168.', what: 'a machine on someone’s LAN' },
  { needle: 'localhost', what: 'localhost' },
];

let eas;
try {
  eas = JSON.parse(readFileSync(easPath, 'utf8'));
} catch (err) {
  console.error(`Could not read ${easPath}: ${err.message}`);
  process.exit(1);
}

const profile = eas?.build?.production;
if (!profile) {
  console.error('No `production` build profile in eas.json.');
  process.exit(1);
}

const env = profile.env ?? {};
const problems = [];

for (const [key, value] of Object.entries(env)) {
  if (typeof value !== 'string') continue;
  for (const { needle, what } of NON_PRODUCTION) {
    if (value.includes(needle)) {
      problems.push(`  ${key}\n    points at ${what}\n    (${value})`);
      break;
    }
  }
}

if (problems.length === 0) {
  console.log('✓ eas.json production profile does not reference a known non-production backend.');
  console.log('  This checks the values it can recognise — confirm they are genuinely production.');
  process.exit(0);
}

console.error('');
console.error('  DO NOT SHIP THIS BUILD');
console.error('');
console.error('  The `production` EAS profile points at a non-production backend:');
console.error('');
console.error(problems.join('\n'));
console.error('');
console.error('  Shipping this to a store puts real users on that database, and the');
console.error('  only fix is another review cycle.');
console.error('');
console.error('  Expected until HANDOVER P0.1-P0.4 are done. Point the profile at the');
console.error('  real production backend, then run this again.');
console.error('');
process.exit(1);
