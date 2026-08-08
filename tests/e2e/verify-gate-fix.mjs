// Regression test for the CRITICAL checklist-gate bypass (audit 2026-08-08).
//
// The exploit: project_stage_items was seeded lazily by GET /stage-items, so a
// project nobody had opened had zero checklist rows, the gate had nothing to
// block on, and both sides could sign a project straight through the
// advance_payment gate with an empty payment ledger.
//
// This drives exactly that sequence and asserts the money gate now HOLDS. It
// fails on the pre-fix code and passes after.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-gate-fix.mjs

import { Actor } from './lib/actor.mjs';
import { Scenario, loadPersonaState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { openProject, currentStage } from './lib/lifecycle.mjs';

const s = new Scenario('verify-gate-fix', 'Checklist gate — money-gate bypass regression');

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;

  // Fresh project between boAt and Sourav, with no prior state.
  const sel = `select id from campaign_projects where owner_user_id=${lit(uid('boat'))} and counterparty_user_id=${lit(uid('sourav'))}`;
  await sql(`
    begin;
    delete from project_stage_items   where project_id in (${sel});
    delete from project_stage_entries where project_id in (${sel});
    delete from project_activity      where project_id in (${sel});
    delete from project_payments      where project_id in (${sel});
    delete from reviews               where project_id in (${sel});
    delete from campaign_projects where owner_user_id=${lit(uid('boat'))} and counterparty_user_id=${lit(uid('sourav'))};
    delete from project_proposals where proposed_by in (${lit(uid('boat'))}, ${lit(uid('sourav'))});
    commit;
    select 1 as ok;`);

  const [req] = await sql(
    `select id from collab_requests
     where from_user_id=${lit(uid('boat'))} and to_user_id=${lit(uid('sourav'))} and status='accepted' limit 1`);
  if (!req) throw new Error('No accepted boAt → Sourav request; run phase3 first.');

  const opened = await openProject(A.boat, A.sourav, {
    requestId: req.id, title: 'boAt × Sourav — gate regression', budget: 800000, advance: 300000,
  });
  const pid = opened.projectId;
  s.check('fresh project created', Boolean(pid),
    { severity: 'HIGH', observed: `${opened.acceptStatus} ${JSON.stringify(opened.acceptBody).slice(0, 200)}` });

  s.section('The exploit sequence — never fetch the checklist');

  const rowsAtCreation = await sql(
    `select count(*)::int as n from project_stage_items where project_id=${lit(pid)}`);
  s.note('checklist rows immediately after creation', rowsAtCreation[0].n);

  // Jump straight to the money gate without ever calling GET /stage-items.
  await sql(`update campaign_projects set current_stage='advance_payment',
             stage_progress='{}'::jsonb where id=${lit(pid)}`);

  const bizSign = await A.boat.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const creSign = await A.sourav.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const after = await currentStage(pid);
  const paid = await sql(
    `select count(*)::int as n from project_payments where project_id=${lit(pid)} and status='paid'`);

  s.note('sign-off responses', [bizSign.status, creSign.status]);
  s.note('stage after both sign-offs', after.current_stage);
  s.note('paid ledger rows', paid[0].n);

  s.check('the unpaid advance_payment gate HOLDS against a checklist-free caller',
    after.current_stage === 'advance_payment' && paid[0].n === 0,
    { severity: 'CRITICAL',
      observed: `stage=${after.current_stage}, paid=${paid[0].n}, signoff=[${bizSign.status},${creSign.status}]`,
      expected: 'stage stays at advance_payment' });

  s.check('the gate refuses with 409 and names what is blocking',
    bizSign.status === 409 && Array.isArray(bizSign.body?.blocking) && bizSign.body.blocking.length > 0,
    { severity: 'HIGH',
      observed: `${bizSign.status} ${JSON.stringify(bizSign.body).slice(0, 220)}`,
      expected: "409 with a non-empty `blocking` array" });

  s.check('the gate materialised the checklist rather than leaving it empty',
    (await sql(`select count(*)::int as n from project_stage_items where project_id=${lit(pid)}`))[0].n > 0,
    { severity: 'HIGH', observed: 'see count', expected: '> 0 rows after the gate ran' });

  s.section('The same bypass via `advance`');

  await sql(`
    begin;
    delete from project_stage_items where project_id=${lit(pid)};
    update campaign_projects set current_stage='advance_payment', stage_progress='{}'::jsonb where id=${lit(pid)};
    commit;
    select 1 as ok;`);

  const adv = await A.boat.patch(`/api/projects/${pid}`, { action: 'advance' });
  const afterAdv = await currentStage(pid);
  s.check('the `advance` path is gated too, on a checklist-free project',
    afterAdv.current_stage === 'advance_payment',
    { severity: 'CRITICAL', observed: `${adv.status} → stage=${afterAdv.current_stage}`,
      expected: 'stage stays at advance_payment' });

  s.section('final_payment / confirm_completion');

  await sql(`
    begin;
    delete from project_stage_items where project_id=${lit(pid)};
    update campaign_projects set current_stage='final_payment', stage_progress='{}'::jsonb where id=${lit(pid)};
    commit;
    select 1 as ok;`);

  const creatorComplete = await A.sourav.patch(`/api/projects/${pid}`, { action: 'confirm_completion' });
  s.check('the creator cannot confirm completion with no final payment recorded',
    creatorComplete.status === 409,
    { severity: 'CRITICAL',
      observed: `${creatorComplete.status} ${JSON.stringify(creatorComplete.body).slice(0, 220)}`,
      expected: 409 });

  s.section('Non-money stages still behave normally');

  await sql(`
    begin;
    delete from project_stage_items where project_id=${lit(pid)};
    update campaign_projects set current_stage='collaboration_started', stage_progress='{}'::jsonb where id=${lit(pid)};
    commit;
    select 1 as ok;`);

  // Both tick what they own, then both sign off — the ordinary happy path must
  // still work, or the fix would have turned a bypass into a deadlock.
  const items = await A.boat.get(`/api/projects/${pid}/stage-items`);
  const required = (items.body?.items || []).filter(
    (it) => it.stage_key === 'collaboration_started' && it.is_required);
  for (const it of required) {
    await A.boat.patch(`/api/projects/${pid}/stage-items`, { item_id: it.id, done: true });
  }
  const s1 = await A.boat.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const s2 = await A.sourav.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const afterHappy = await currentStage(pid);

  s.check('a properly completed non-money stage still advances',
    afterHappy.current_stage === 'project_discussion',
    { severity: 'CRITICAL',
      observed: `signoff=[${s1.status},${s2.status}] stage=${afterHappy.current_stage}`,
      expected: 'project_discussion — the fix must not deadlock the happy path' });

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
