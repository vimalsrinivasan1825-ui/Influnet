#!/usr/bin/env node
/**
 * Refuse to ship a mobile store build that is not pointed at production.
 *
 * ── Why this script exists ───────────────────────────────────────────────
 * Env is baked into a mobile binary at build time. A store build pointed at
 * the wrong backend puts real users on the wrong database, and the only fix
 * is another store review cycle. JSON has no comments, so the rule cannot live
 * in eas.json itself. It lives here, and it is enforced rather than written
 * down.
 *
 * ── What "production" means ──────────────────────────────────────────────
 * Since 2026-09-16 the owner's decision is that STAGING SERVES REAL USERS —
 * there is no separate production tier (docs/operations/
 * BLOCK_0_TO_5_STATUS_2026-09-14.md, "staging adopted as production"). So the
 * production profile must point at exactly the staging API and the staging
 * Supabase project, and nowhere else.
 *
 * This is a POSITIVE allow-list, not a deny-list: an unrecognised host fails
 * too. If a separate production tier is ever built, change PRODUCTION below in
 * the same commit that repoints eas.json.
 *
 * Usage:  node scripts/check-mobile-production-target.mjs
 *         (also runs automatically on EAS as apps/mobile's `eas-build-pre-install`)
 * Exit 0 = safe to build. Exit 1 = do not ship.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const easPath = resolve(here, '..', 'apps', 'mobile', 'eas.json');

/** The one backend real users are on. */
export const PRODUCTION = {
  EXPO_PUBLIC_API_BASE_URL: 'https://staging.influnet.io',
  EXPO_PUBLIC_SUPABASE_URL: 'https://aokdansyqxracuwsosji.supabase.co',
};

/** Recognisable wrong answers, for a clearer message than "not allowed". */
const KNOWN_WRONG = [
  { needle: 'jaajosocopoicmqcffuu', what: 'the DEV Supabase project' },
  { needle: 'dev.influnet.io', what: 'the DEV API' },
  { needle: '192.168.', what: 'a machine on someone’s LAN' },
  { needle: 'localhost', what: 'localhost' },
  { needle: 'http://', what: 'plain HTTP' },
];

export function checkProfile(env) {
  const problems = [];
  for (const [key, expected] of Object.entries(PRODUCTION)) {
    const value = env?.[key];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`  ${key} is not set (expected ${expected})`);
      continue;
    }
    if (value.replace(/\/+$/, '') !== expected) {
      const wrong = KNOWN_WRONG.find(({ needle }) => value.includes(needle));
      problems.push(
        `  ${key}\n    is ${value}` +
          (wrong ? ` — ${wrong.what}` : '') +
          `\n    expected ${expected}`,
      );
    }
  }
  for (const key of ['EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_STREAM_API_KEY']) {
    if (typeof env?.[key] !== 'string' || env[key].length === 0) {
      problems.push(`  ${key} is not set`);
    }
  }
  return problems;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// On EAS builders this runs as the `eas-build-pre-install` hook for EVERY
// profile; only the production profile ships to stores.
const easProfile = process.env.EAS_BUILD_PROFILE;
if (isMain && easProfile && easProfile !== 'production') {
  console.log(`check-mobile-production-target: skipped for EAS profile "${easProfile}".`);
  process.exit(0);
}

if (isMain) {
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

  const problems = checkProfile(profile.env ?? {});
  if (problems.length === 0) {
    console.log('✓ eas.json production profile points at the production backend');
    console.log(`  (${PRODUCTION.EXPO_PUBLIC_API_BASE_URL}, ${PRODUCTION.EXPO_PUBLIC_SUPABASE_URL}).`);
    process.exit(0);
  }

  console.error('');
  console.error('  DO NOT SHIP THIS BUILD');
  console.error('');
  console.error('  The `production` EAS profile is not pointed at production:');
  console.error('');
  console.error(problems.join('\n'));
  console.error('');
  console.error('  A store build carries this env for its whole life; fixing it later');
  console.error('  means another review cycle.');
  console.error('');
  process.exit(1);
}
