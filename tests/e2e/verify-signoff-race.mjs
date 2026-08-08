// Regression test for the concurrent sign-off lost update (audit 2026-08-08).
//
// The bug: PATCH {action:'signoff'} did read-modify-write on the whole
// stage_progress jsonb. Two simultaneous confirmations both read a state with
// neither signature, and the second write clobbered the first. The
// enforce_project_consent trigger caught it and raised consent_violation, which
// the route surfaced as a 500 — so one person's click produced a server error,
// their sign-off was gone, and the stage stuck.
//
// One round is not enough to trust: the original bug was non-deterministic (the
// losing side alternated between runs). This runs 20 rounds and requires every
// single one to land both signatures and advance.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-signoff-race.mjs

import { Actor, raceAll } from './lib/actor.mjs';
import { Scenario, loadPersonaState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { currentStage } from './lib/lifecycle.mjs';

const s = new Scenario('verify-signoff-race', 'Sign-off race — lost update regression');

const ROUNDS = 20;

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;

  const [proj] = await sql(
    `select id from campaign_projects
     where owner_user_id=${lit(uid('mamaearth'))} and counterparty_user_id=${lit(uid('sourav'))}
     order by created_at desc limit 1`);
  if (!proj) throw new Error('No Mamaearth × Sourav project; run phase4 first.');
  const pid = proj.id;

  // collaboration_started is a mutual-sign-off stage whose required item is
  // owned by 'both', so either side can satisfy it — which keeps this test
  // about the race and nothing else.
  await A.mamaearth.get(`/api/projects/${pid}/stage-items`);

  s.section(`${ROUNDS} simultaneous sign-off rounds`);

  let bothLanded = 0;
  let advanced = 0;
  let serverErrors = 0;
  const statusPairs = [];
  const failures = [];

  for (let round = 1; round <= ROUNDS; round++) {
    await sql(`
      begin;
      update campaign_projects set current_stage='collaboration_started',
             stage_progress='{}'::jsonb, status='active' where id=${lit(pid)};
      update project_stage_items set done_at=now(), done_by=${lit(uid('mamaearth'))}
             where project_id=${lit(pid)} and stage_key='collaboration_started';
      commit;
      select 1 as ok;`);

    const [a, b] = await raceAll([
      () => A.mamaearth.patch(`/api/projects/${pid}`, { action: 'signoff' }),
      () => A.sourav.patch(`/api/projects/${pid}`, { action: 'signoff' }),
    ]);
    statusPairs.push([a.status, b.status]);
    if (a.status >= 500 || b.status >= 500) serverErrors++;

    const after = await currentStage(pid);
    const entry = (after.stage_progress || {}).collaboration_started || {};
    const both = Boolean(entry.owner_signoff_at) && Boolean(entry.creator_signoff_at);
    if (both) bothLanded++;
    if (after.current_stage === 'project_discussion') advanced++;

    if (!both || after.current_stage !== 'project_discussion') {
      failures.push({
        round,
        statuses: [a.status, b.status],
        owner: entry.owner_signoff_at ?? 'MISSING',
        creator: entry.creator_signoff_at ?? 'MISSING',
        stage: after.current_stage,
      });
    }
  }

  s.note('status pairs observed', JSON.stringify(statusPairs));
  s.note('rounds where both signatures landed', `${bothLanded}/${ROUNDS}`);
  s.note('rounds where the stage advanced', `${advanced}/${ROUNDS}`);

  s.check('both sign-offs survive a simultaneous write, every round',
    bothLanded === ROUNDS,
    { severity: 'HIGH', observed: failures.length ? failures : `${bothLanded}/${ROUNDS}`,
      expected: `${ROUNDS}/${ROUNDS}` });

  s.check('the stage advances every round when both sides confirm at once',
    advanced === ROUNDS,
    { severity: 'HIGH', observed: failures.length ? failures : `${advanced}/${ROUNDS}`,
      expected: `${ROUNDS}/${ROUNDS}`,
      note: 'A stuck stage after both sides clicked confirm is the user-visible symptom.' });

  s.check('no sign-off returns a 5xx under contention',
    serverErrors === 0,
    { severity: 'HIGH', observed: `${serverErrors} rounds produced a 5xx: ${JSON.stringify(statusPairs.filter((p) => p.some((x) => x >= 500)))}`,
      expected: '0 — losing a race is not a server fault' });

  s.section('Sign-off remains correct in the ordinary sequential case');

  await sql(`
    begin;
    update campaign_projects set current_stage='collaboration_started',
           stage_progress='{}'::jsonb, status='active' where id=${lit(pid)};
    update project_stage_items set done_at=now(), done_by=${lit(uid('mamaearth'))}
           where project_id=${lit(pid)} and stage_key='collaboration_started';
    commit;
    select 1 as ok;`);

  const first = await A.mamaearth.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const midway = await currentStage(pid);
  s.check('one side signing alone does NOT advance the stage',
    midway.current_stage === 'collaboration_started',
    { severity: 'CRITICAL', observed: `${first.status} → ${midway.current_stage}`,
      expected: 'collaboration_started — a mutual stage needs both' });

  // Signing twice must be idempotent, not a second signature.
  const firstAt = (midway.stage_progress || {}).collaboration_started?.owner_signoff_at;
  await A.mamaearth.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const afterDouble = await currentStage(pid);
  s.check('signing off twice is idempotent and keeps the original timestamp',
    (afterDouble.stage_progress || {}).collaboration_started?.owner_signoff_at === firstAt &&
    afterDouble.current_stage === 'collaboration_started',
    { severity: 'MEDIUM',
      observed: `${firstAt} → ${(afterDouble.stage_progress || {}).collaboration_started?.owner_signoff_at}, stage=${afterDouble.current_stage}`,
      expected: 'unchanged timestamp, stage unchanged' });

  const second = await A.sourav.patch(`/api/projects/${pid}`, { action: 'signoff' });
  const done = await currentStage(pid);
  s.check('the second side’s sign-off advances the stage',
    done.current_stage === 'project_discussion',
    { severity: 'CRITICAL', observed: `${second.status} → ${done.current_stage}`,
      expected: 'project_discussion' });

  s.section('Revoke still works and cannot touch the other side');

  await sql(`
    begin;
    update campaign_projects set current_stage='collaboration_started',
           stage_progress='{}'::jsonb, status='active' where id=${lit(pid)};
    commit;
    select 1 as ok;`);

  await A.mamaearth.patch(`/api/projects/${pid}`, { action: 'signoff' });
  await A.sourav.patch(`/api/projects/${pid}`, { action: 'revoke_signoff' });
  const afterRevoke = await currentStage(pid);
  const e = (afterRevoke.stage_progress || {}).collaboration_started || {};
  s.check('one side revoking leaves the other side’s sign-off intact',
    Boolean(e.owner_signoff_at) && !e.creator_signoff_at,
    { severity: 'HIGH', observed: `owner=${e.owner_signoff_at ?? 'MISSING'} creator=${e.creator_signoff_at ?? 'null'}`,
      expected: 'owner present, creator absent' });

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
