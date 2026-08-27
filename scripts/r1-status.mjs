#!/usr/bin/env node
/**
 * R1 status probe — answers "what is actually applied and wired?" in one shot,
 * so the answer never comes from a summary someone typed by hand.
 *
 * Run:  node --env-file=apps/web/.env.local scripts/r1-status.mjs
 */
import { sql } from '../tests/e2e/lib/sql.mjs';
import { execSync } from 'node:child_process';

const ok = (b) => (b ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m');
const grep = (pattern, path) => {
  try {
    return execSync(`grep -rl ${JSON.stringify(pattern)} ${path} 2>/dev/null`, { encoding: 'utf8' }).trim().length > 0;
  } catch { return false; }
};

const applied = (await sql(
  "select version from supabase_migrations.schema_migrations where version::int >= 119 order by version",
)).map((r) => r.version);
const EXPECTED_MIGRATIONS = ['119','120','121','122','123','124','125','126','127','128','129','130','131','132','133'];
const missing = EXPECTED_MIGRATIONS.filter((v) => !applied.includes(v));

const tables = (await sql(
  "select table_name from information_schema.tables where table_schema='public' " +
  "and table_name in ('campaigns','campaign_applications','project_documents','saved_items')",
)).map((r) => r.table_name);

const statsCols = (await sql(
  "select pg_get_function_result(oid) as r from pg_proc where proname='get_collaboration_stats'",
))[0].r;

const billing = (await sql(
  "select column_name from information_schema.columns where table_name='billing_settings' " +
  "and column_name in ('free_live_campaigns','free_applications_per_week','campaign_default_days')",
)).map((r) => r.column_name);

const entDef = (await sql("select prosrc from pg_proc where proname='get_entitlements'"))[0]?.prosrc ?? '';
const signoffDef = (await sql("select prosrc from pg_proc where proname='record_stage_signoff'"))[0]?.prosrc ?? '';
const consentDef = (await sql("select prosrc from pg_proc where proname='enforce_project_consent'"))[0]?.prosrc ?? '';

console.log('\n── Database ──');
console.log(`${ok(missing.length === 0)}  migrations 119–133 applied${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
console.log(`${ok(tables.length === 4)}  R1 tables present (${tables.length}/4)`);
console.log(`${ok(billing.length === 3)}  campaign limit columns (${billing.length}/3)`);
console.log(`${ok(statsCols.includes('requests_sent'))}  get_collaboration_stats returns requests_sent`);
console.log(`${ok(entDef.includes('liveCampaigns') && entDef.includes('projectConversions'))}  get_entitlements reports liveCampaigns AND kept projectConversions (117)`);
console.log(`${ok(signoffDef.includes("THEN 'completed'"))}  record_stage_signoff marks a signoff-driven completion as status='completed'`);
console.log(`${ok(consentDef.includes('v_mutual_signoff_completion'))}  enforce_project_consent allows a verified mutual sign-off to set both confirm columns`);

console.log('\n── Wired into the app ──');
const checks = [
  ['C6 publish cap enforced (route)', grep('requireLiveCampaignQuota', 'apps/web/src')],
  ['C6 apply cap enforced (route)', grep('requireWeeklyQuota', 'apps/web/src')],
  ['C4 hand-off reachable from UI', grep("action: 'accept'", 'apps/web/src apps/mobile')],
  ['S4 funnel screen renders it', grep('NetworkingFunnel', 'apps/web/src')],
  ['B3 documents UI (mobile)', grep('ProjectDocuments', 'apps/mobile')],
  ['B3 documents downloadable (signed token route)', grep('signDocumentToken', 'apps/web/src')],
  ['S1 creator level rendered (mobile)', grep('creatorLevel', 'apps/mobile/app')],
  ['S3 favourites (mobile)', grep('saveItem', 'apps/mobile')],
  ['S5 review scores collected (web UI)', grep('qualityScore', 'apps/web/src')],
  ['S5 review scores collected (mobile UI)', grep('CriteriaPicker', 'apps/mobile')],
  ['mobile campaign detail screen exists', grep('CampaignDetailScreen', 'apps/mobile')],
];
for (const [label, pass] of checks) console.log(`${ok(pass)}  ${label}`);

console.log('\n── Tests ──');
const hasPhase8 = grep('quick_agreement', 'tests/e2e/phase8-r1-features.mjs');
const hasGateTest = grep('paymentGateStage', 'apps/web/tests/unit');
console.log(`${ok(hasPhase8)}  tests/e2e/phase8-r1-features.mjs drives short-term projects + campaigns end to end`);
console.log(`${ok(hasGateTest)}  a unit test pins paymentGateStage() against all three flows\n`);
console.log('Run the e2e phase itself for the real proof (needs a running dev server, SUBSCRIPTIONS_ENABLED=true):');
console.log('  node --env-file=apps/web/.env.local tests/e2e/phase8-r1-features.mjs\n');
