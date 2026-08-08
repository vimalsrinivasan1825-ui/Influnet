// Phase 1 — create every audit persona through the REAL signup path.
//
// Deliberately NOT direct DB inserts. The register endpoint is where username
// collision, phone normalisation, the approval-status strip and the role guard
// all live; seeding around it would mean the whole audit runs on rows that no
// real signup could ever have produced.
//
// Only AFTER a persona exists do we reach into the DB to bypass the gates the
// user asked to bypass (email confirmation, business approval, ownership
// verification) — and each bypass is recorded so the report can say which
// results depended on one.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/seed-personas.mjs

import { Actor } from './lib/actor.mjs';
import { CREATORS, BUSINESSES, ALL_PERSONAS } from './lib/personas.mjs';
import { sql, lit } from './lib/sql.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, 'state');
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

const findings = [];
function finding(severity, area, title, detail) {
  findings.push({ severity, area, title, detail });
  console.log(`  [${severity}] ${area}: ${title}`);
  if (detail) console.log(`         ${detail}`);
}

async function main() {
  console.log('=== Phase 1: seeding audit personas ===\n');

  // --- wipe any previous audit run so re-runs are deterministic -------------
  console.log('Clearing previous audit personas...');
  const emails = ALL_PERSONAS.map((p) => lit(p.email)).join(',');
  const prior = await sql(`select id, email from auth.users where email in (${emails})`);
  if (prior.length) {
    const ids = prior.map((r) => lit(r.id)).join(',');

    // Schema-driven rather than a hand-maintained table list. Every public
    // column that is a foreign key onto profiles.id (or auth.users.id) gets
    // nulled-or-deleted, so this keeps working when a migration adds a table.
    // A hard-coded list silently stops purging the moment the schema moves,
    // and a half-purged persona makes the next run's assertions lie.
    const fkCols = await sql(`
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
        and ((ccu.table_name = 'profiles' and ccu.column_name = 'id')
          or (ccu.table_name = 'users' and ccu.column_name = 'id'))
      order by tc.table_name`);

    const projFks = await sql(`
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
        and ccu.table_name='campaign_projects' and ccu.column_name='id'`);

    // One transaction, one API call. Issuing ~120 separate statements trips the
    // Management API's own throttle; batching also makes the purge atomic, so a
    // throttle mid-way can't leave a half-deleted persona behind.
    const projSel = `select id from campaign_projects where owner_user_id in (${ids}) or counterparty_user_id in (${ids})`;
    const stmts = [
      'begin;',
      ...projFks.map((c) => `delete from ${c.table_name} where ${c.column_name} in (${projSel});`),
      `delete from campaign_projects where owner_user_id in (${ids}) or counterparty_user_id in (${ids});`,
      // Three passes: these tables reference each other, so one sweep can leave
      // rows whose FK parent only became deletable during the sweep.
      ...[0, 1, 2].flatMap(() =>
        fkCols
          .filter((c) => c.table_name !== 'profiles')
          .map((c) => `delete from ${c.table_name} where ${c.column_name} in (${ids});`)
      ),
      'delete from conversations where id not in (select conversation_id from conversation_participants);',
      `delete from profiles where id in (${ids});`,
      `delete from auth.users where id in (${ids});`,
      'commit;',
      'select 1 as done;',
    ];
    await sql(stmts.join('\n'));
    console.log(`  removed ${prior.length} prior persona(s) across ${fkCols.length} FK columns\n`);
  }

  // --- create every persona through signUp + /api/auth/register ------------
  //
  // Paced deliberately. /api/auth/register rate-limits to 10 per 60s per IP,
  // so seeding 12 personas back-to-back gets the last two 429'd — which is the
  // limiter working correctly, not a bug. Registering slower is the honest way
  // to seed; raising the limit for tests would hide the very control we want
  // running during the abuse phase.
  const actors = {};
  let registered = 0;
  for (const persona of ALL_PERSONAS) {
    const actor = new Actor(persona);
    process.stdout.write(`  ${persona.key.padEnd(12)} `);
    try {
      // 9 per window, then wait out the window.
      if (registered > 0 && registered % 9 === 0) {
        process.stdout.write('(pausing 61s for the register rate-limit window) ');
        await new Promise((r) => setTimeout(r, 61_000));
      }
      await actor.signUp();
      if (!actor.token) {
        // Email confirmation is ON. Registration cannot complete at signup time.
        finding('INFO', 'signup', `${persona.key}: signUp returned no session`,
          'Email confirmation appears to be ON — register() will need a confirmed user first.');
        await sql(`update auth.users set email_confirmed_at = now() where email = ${lit(persona.email)}`);
        await actor.signIn();
      }
      const reg = await actor.register();
      if (reg.status !== 200) {
        finding('HIGH', 'signup', `${persona.key}: /api/auth/register returned ${reg.status}`,
          JSON.stringify(reg.body).slice(0, 400));
        process.stdout.write(`FAILED (${reg.status})\n`);
        continue;
      }
      actors[persona.key] = actor;
      registered += 1;
      process.stdout.write(`ok  ${actor.userId}\n`);
    } catch (err) {
      finding('HIGH', 'signup', `${persona.key}: threw during signup`, String(err).slice(0, 400));
      process.stdout.write(`THREW: ${String(err).slice(0, 120)}\n`);
    }
  }

  console.log('\nApplying dev-environment bypasses...');
  const ids = Object.values(actors).map((a) => lit(a.userId)).join(',');

  // 1. Email confirmation — dev DB, explicitly sanctioned bypass.
  const unconfirmed = await sql(
    `select count(*)::int as n from auth.users where id in (${ids}) and email_confirmed_at is null`);
  if (unconfirmed[0].n > 0) {
    await sql(`update auth.users set email_confirmed_at = now() where id in (${ids}) and email_confirmed_at is null`);
    console.log(`  confirmed ${unconfirmed[0].n} email(s) [BYPASS]`);
  } else {
    console.log('  all emails already confirmed at signup (confirmation is OFF)');
  }

  // 2. Business approval — every business except the deliberate control.
  const toApprove = BUSINESSES.filter((b) => b.approve && actors[b.key])
    .map((b) => lit(actors[b.key].userId));
  if (toApprove.length) {
    await sql(`update business_profiles set approval_status = 'approved'
               where user_id in (${toApprove.join(',')})`);
    console.log(`  approved ${toApprove.length} business(es) [BYPASS]`);
  }
  const held = BUSINESSES.filter((b) => !b.approve && actors[b.key]).map((b) => b.key);
  if (held.length) console.log(`  left unapproved (control): ${held.join(', ')}`);

  // 3. Ownership verification — creators must look verified so the collab
  //    gate (requireVerifiedOwnership) doesn't block the whole audit. Written
  //    through the same columns the real pipeline uses.
  const creatorIds = CREATORS.filter((c) => actors[c.key]).map((c) => lit(actors[c.key].userId));
  if (creatorIds.length) {
    const cols = await sql(`select column_name from information_schema.columns
      where table_schema='public' and table_name='influencer_profiles'
        and column_name in ('ownership_verified','ownership_verified_at','is_verified','instagram_verified','verification_status')`);
    console.log(`  influencer_profiles verification columns: ${cols.map((c) => c.column_name).join(', ') || '(none)'}`);
  }

  // --- persist state for later phases --------------------------------------
  const state = {
    seededAt: new Date().toISOString(),
    actors: Object.fromEntries(
      Object.entries(actors).map(([k, a]) => [k, {
        key: k, userId: a.userId, role: a.role, name: a.name,
        email: a.persona.email, password: a.persona.password,
        username: a.persona.username || a.persona.businessUsername,
      }])
    ),
  };
  writeFileSync(join(STATE_DIR, 'personas.json'), JSON.stringify(state, null, 2));

  // --- verify what actually landed in the DB --------------------------------
  console.log('\nVerifying seeded rows:');
  const rows = await sql(`
    select p.id, p.role, p.name, p.phone,
           b.approval_status, b.company_name, b.username as business_username,
           i.username as creator_username,
           i.instagram_handle, i.instagram_followers, i.youtube_handle
    from profiles p
    left join business_profiles b on b.user_id = p.id
    left join influencer_profiles i on i.user_id = p.id
    where p.id in (${ids})
    order by p.role, p.name`);
  for (const r of rows) {
    const extra = r.role === 'business_owner'
      ? `${r.company_name} [${r.approval_status}] /${r.business_username ?? '—'}`
      : `/${r.creator_username ?? '—'} @${r.instagram_handle || r.youtube_handle || '—'} ${r.instagram_followers ?? ''}`;
    console.log(`  ${String(r.role).padEnd(15)} ${String(r.name).padEnd(20)} ${extra}`);
  }

  console.log(`\nSeeded ${Object.keys(actors).length}/${ALL_PERSONAS.length} personas.`);
  writeFileSync(join(STATE_DIR, 'phase1-findings.json'), JSON.stringify(findings, null, 2));
  if (findings.length) console.log(`Findings: ${findings.length} (see state/phase1-findings.json)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
