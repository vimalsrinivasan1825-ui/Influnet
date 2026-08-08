// Phase 4/5 — messaging, deal negotiation, and the full 12-stage machine.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phase4-lifecycle.mjs

import { Actor, raceAll } from './lib/actor.mjs';
import { Scenario, loadPersonaState, saveState, sleep } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { openProject, passStage, currentStage, tickChecklist, STAGES, NON_SIGNOFF_STAGES } from './lib/lifecycle.mjs';

const s = new Scenario('phase4-lifecycle', 'Phase 4/5 — messaging, deals & the 12-stage machine');

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;

  // Phase 3 left five accepted requests against Sourav. Re-establish a clean,
  // known set here so this phase can run standalone.
  const reqs = await sql(
    `select id, from_user_id, to_user_id, status from collab_requests
     where to_user_id = ${lit(uid('sourav'))} and status = 'accepted'`);
  s.note('accepted requests available', reqs.length);

  const byBiz = Object.fromEntries(reqs.map((r) => [r.from_user_id, r.id]));

  // Re-run hygiene. The deal section below negotiates the Mamaearth × Sourav
  // collaboration from scratch, and propose_project refuses a second project on
  // a collaboration that already has one — so on a re-run every negotiation
  // assertion would fail with "project_already_exists" and report a product bug
  // that isn't there. Drop just that pair's project and proposals.
  const sel = `select id from campaign_projects where owner_user_id=${lit(uid('mamaearth'))} and counterparty_user_id=${lit(uid('sourav'))}`;
  await sql(`
    begin;
    delete from project_stage_items   where project_id in (${sel});
    delete from project_stage_entries where project_id in (${sel});
    delete from project_activity      where project_id in (${sel});
    delete from project_payments      where project_id in (${sel});
    delete from reviews               where project_id in (${sel});
    delete from campaign_projects
      where owner_user_id=${lit(uid('mamaearth'))} and counterparty_user_id=${lit(uid('sourav'))};
    delete from project_proposals
      where proposed_by in (${lit(uid('mamaearth'))}, ${lit(uid('sourav'))});
    commit;
    select 1 as ok;`);

  // ══════════════════════════════════════════════════════════════════════
  s.section('Messaging');

  const conv = await A.mamaearth.post('/api/conversations', { other_user_id: uid('sourav') });
  const convId = conv.body?.conversation?.id;
  s.check('business can open a conversation with an accepted creator',
    conv.status === 200 && Boolean(convId),
    { severity: 'HIGH', observed: `${conv.status} ${JSON.stringify(conv.body).slice(0, 150)}` });

  // get_or_create must be idempotent, including under a race.
  const convRace = await raceAll(Array.from({ length: 4 }, () => () =>
    A.mamaearth.post('/api/conversations', { other_user_id: uid('sourav') })));
  const convIds = new Set(convRace.map((r) => r.body?.conversation?.id).filter(Boolean));
  s.check('4 simultaneous "open conversation" calls yield ONE conversation',
    convIds.size === 1,
    { severity: 'HIGH', observed: `${convIds.size} distinct ids: ${[...convIds].join(', ')}`, expected: '1' });

  if (convId) {
    const m1 = await A.mamaearth.post(`/api/conversations/${convId}/messages`, { content: 'Hello from Mamaearth.' });
    s.check('participant can post a message', m1.status === 200 || m1.status === 201,
      { severity: 'HIGH', observed: `${m1.status} ${JSON.stringify(m1.body).slice(0, 150)}` });

    // A non-participant must not read or write this conversation.
    const intrudeRead = await A.nagma.get(`/api/conversations/${convId}/messages`);
    s.check('non-participant cannot READ another pair’s messages',
      intrudeRead.status === 403 || intrudeRead.status === 404,
      { severity: 'CRITICAL', observed: `${intrudeRead.status} ${JSON.stringify(intrudeRead.body).slice(0, 200)}`,
        expected: '403/404' });

    const intrudeWrite = await A.nagma.post(`/api/conversations/${convId}/messages`, { content: 'I should not be here.' });
    s.check('non-participant cannot WRITE into another pair’s conversation',
      intrudeWrite.status === 403 || intrudeWrite.status === 404,
      { severity: 'CRITICAL', observed: `${intrudeWrite.status} ${JSON.stringify(intrudeWrite.body).slice(0, 200)}`,
        expected: '403/404' });

    const leaked = await sql(
      `select count(*)::int as n from messages where conversation_id = ${lit(convId)}
       and sender_user_id = ${lit(uid('nagma'))}`);
    s.check('the intruder’s message did not land in the database',
      leaked[0].n === 0,
      { severity: 'CRITICAL', observed: `${leaked[0].n} rows`, expected: '0' });

    // Empty and oversized messages.
    const empty = await A.mamaearth.post(`/api/conversations/${convId}/messages`, { content: '' });
    s.check('empty message is rejected', empty.status === 400,
      { severity: 'LOW', observed: empty.status, expected: 400 });

    const huge = await A.mamaearth.post(`/api/conversations/${convId}/messages`, { content: 'x'.repeat(100_000) });
    s.check('100k-character message is rejected', huge.status === 400,
      { severity: 'MEDIUM', observed: huge.status, expected: 400 });

    // Message flood — is there any rate limit at all?
    const flood = await raceAll(Array.from({ length: 30 }, (_, i) => () =>
      A.mamaearth.post(`/api/conversations/${convId}/messages`, { content: `flood ${i}` })));
    const floodOk = flood.filter((r) => r.ok).length;
    const flood429 = flood.filter((r) => r.status === 429).length;
    s.check('a 30-message burst is rate-limited',
      flood429 > 0,
      { severity: 'MEDIUM', observed: `${floodOk} accepted, ${flood429} rate-limited`,
        expected: 'some 429s',
        note: 'Without a limit here one account can flood another’s inbox and the ' +
              'push/email notification pipeline behind it.' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Deal negotiation → project creation');

  const mamaReq = byBiz[uid('mamaearth')];
  s.check('an accepted collab request exists for Mamaearth → Sourav', Boolean(mamaReq),
    { severity: 'HIGH', observed: Object.keys(byBiz).length + ' accepted requests' });

  let lifecycle = null;
  if (mamaReq) {
    // Terms may only be proposed once at a time.
    const p1 = await A.mamaearth.post(`/api/conversations/${convId}/deal`, {
      collab_request_id: mamaReq, title: 'Mamaearth Onion Range — Reel Series', budget: 500000, advance_amount: 150000,
    });
    s.check('business can propose terms', Boolean(p1.body?.proposal_id),
      { severity: 'HIGH', observed: `${p1.status} ${JSON.stringify(p1.body).slice(0, 200)}` });

    const p2 = await A.mamaearth.post(`/api/conversations/${convId}/deal`, {
      collab_request_id: mamaReq, title: 'Second proposal while one is pending', budget: 600000,
    });
    s.check('a second proposal while one is pending is refused (409)',
      p2.status === 409,
      { severity: 'MEDIUM', observed: `${p2.status} ${JSON.stringify(p2.body).slice(0, 150)}`, expected: 409 });

    // A proposal is NOT a project.
    const proj0 = await sql(
      `select count(*)::int as n from campaign_projects
       where owner_user_id = ${lit(uid('mamaearth'))} and counterparty_user_id = ${lit(uid('sourav'))}`);
    s.check('proposing terms creates NO project until accepted',
      proj0[0].n === 0,
      { severity: 'HIGH', observed: `${proj0[0].n} projects`, expected: '0' });

    // The proposer must not be able to accept their own terms.
    const selfAccept = await A.mamaearth.patch(`/api/conversations/${convId}/deal`, {
      proposal_id: p1.body.proposal_id, action: 'accept',
    });
    s.check('the proposer cannot accept their OWN terms',
      selfAccept.status >= 400,
      { severity: 'CRITICAL', observed: `${selfAccept.status} ${JSON.stringify(selfAccept.body).slice(0, 200)}`,
        expected: '4xx — a bilateral agreement needs two parties' });

    // Creator declines, then a fresh proposal is accepted — the negotiation loop.
    const decline = await A.sourav.patch(`/api/conversations/${convId}/deal`, {
      proposal_id: p1.body.proposal_id, action: 'decline', note: 'Can we do ₹6L?',
    });
    s.check('creator can decline terms', decline.ok,
      { severity: 'HIGH', observed: `${decline.status} ${JSON.stringify(decline.body).slice(0, 150)}` });

    const p3 = await A.mamaearth.post(`/api/conversations/${convId}/deal`, {
      collab_request_id: mamaReq, title: 'Mamaearth Onion Range — Reel Series',
      budget: 600000, advance_amount: 200000,
      due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    });
    s.check('a new proposal can follow a decline', Boolean(p3.body?.proposal_id),
      { severity: 'HIGH', observed: `${p3.status} ${JSON.stringify(p3.body).slice(0, 200)}` });

    // Accepting twice, simultaneously — must create ONE project.
    const accRace = await raceAll([
      () => A.sourav.patch(`/api/conversations/${convId}/deal`, { proposal_id: p3.body.proposal_id, action: 'accept' }),
      () => A.sourav.patch(`/api/conversations/${convId}/deal`, { proposal_id: p3.body.proposal_id, action: 'accept' }),
    ]);
    s.note('  concurrent double-accept →', accRace.map((r) => r.status));

    const projRows = await sql(
      `select id, current_stage, status, budget from campaign_projects
       where owner_user_id = ${lit(uid('mamaearth'))} and counterparty_user_id = ${lit(uid('sourav'))}`);
    s.check('accepting the same terms twice creates exactly ONE project',
      projRows.length === 1,
      { severity: 'CRITICAL', observed: `${projRows.length} projects: ${JSON.stringify(projRows)}`, expected: '1' });

    if (projRows.length) {
      lifecycle = projRows[0].id;
      s.check('a new project starts at collaboration_started',
        projRows[0].current_stage === 'collaboration_started',
        { severity: 'MEDIUM', observed: projRows[0].current_stage, expected: 'collaboration_started' });
      s.check('the accepted budget is what landed on the project',
        Number(projRows[0].budget) === 600000,
        { severity: 'HIGH', observed: projRows[0].budget, expected: 600000 });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Stage machine — authorization');

  if (lifecycle) {
    // A total stranger must not touch the project at all.
    const strangerRead = await A.nagma.get(`/api/projects/${lifecycle}`);
    s.check('non-participant cannot READ the project',
      strangerRead.status === 403 || strangerRead.status === 404,
      { severity: 'CRITICAL', observed: strangerRead.status, expected: '403/404' });

    const strangerAdvance = await A.nagma.patch(`/api/projects/${lifecycle}`, { action: 'advance' });
    s.check('non-participant cannot ADVANCE the project',
      strangerAdvance.status === 403 || strangerAdvance.status === 404,
      { severity: 'CRITICAL', observed: strangerAdvance.status, expected: '403/404' });

    const strangerSignoff = await A.boat.patch(`/api/projects/${lifecycle}`, { action: 'signoff' });
    s.check('another business cannot sign off on someone else’s project',
      strangerSignoff.status === 403 || strangerSignoff.status === 404,
      { severity: 'CRITICAL', observed: strangerSignoff.status, expected: '403/404' });

    // Wrong actor for the stage. content_planning belongs to the creator; the
    // brand must not be able to advance it.
    await sql(`update campaign_projects set current_stage='content_planning' where id=${lit(lifecycle)}`);
    const wrongActor = await A.mamaearth.patch(`/api/projects/${lifecycle}`, { action: 'advance' });
    s.check('the wrong side cannot advance a single-actor stage',
      wrongActor.status === 403,
      { severity: 'HIGH', observed: `${wrongActor.status} ${JSON.stringify(wrongActor.body).slice(0, 180)}`,
        expected: 403 });

    // Illegal transition: jump straight to completion.
    await sql(`update campaign_projects set current_stage='collaboration_started' where id=${lit(lifecycle)}`);
    const jump = await A.mamaearth.patch(`/api/projects/${lifecycle}`,
      { action: 'advance', stage_key: 'project_completed' });
    s.check('cannot jump from stage 1 straight to project_completed',
      jump.status === 400,
      { severity: 'CRITICAL', observed: `${jump.status} ${JSON.stringify(jump.body).slice(0, 180)}`, expected: 400 });

    const afterJump = await currentStage(lifecycle);
    s.check('the illegal jump left the stage untouched',
      afterJump.current_stage === 'collaboration_started',
      { severity: 'CRITICAL', observed: afterJump.current_stage, expected: 'collaboration_started' });

    // Skipping a payment stage must be impossible.
    await sql(`update campaign_projects set current_stage='advance_payment' where id=${lit(lifecycle)}`);
    const skipPay = await A.mamaearth.patch(`/api/projects/${lifecycle}`,
      { action: 'propose_skip', stage_key: 'advance_payment' });
    s.check('the advance_payment stage cannot be skipped',
      skipPay.status >= 400,
      { severity: 'CRITICAL', observed: `${skipPay.status} ${JSON.stringify(skipPay.body).slice(0, 180)}`,
        expected: '4xx' });

    // The checklist gate must hold against a direct PATCH.
    await sql(`update campaign_projects set current_stage='collaboration_started' where id=${lit(lifecycle)}`);
    await sql(`update project_stage_items set done_at=null, done_by=null where project_id=${lit(lifecycle)}`);
    const ungated = await A.mamaearth.patch(`/api/projects/${lifecycle}`, { action: 'signoff' });
    s.check('sign-off is refused while required checklist items are pending',
      ungated.status === 409,
      { severity: 'HIGH', observed: `${ungated.status} ${JSON.stringify(ungated.body).slice(0, 200)}`,
        expected: 409 });

    // A creator must not be able to tick a business-owned gate item.
    const items = await A.sourav.get(`/api/projects/${lifecycle}/stage-items`);
    const bizItem = (items.body?.items || []).find((it) => it.owner_role === 'business');
    if (bizItem) {
      const crossTick = await A.sourav.patch(`/api/projects/${lifecycle}/stage-items`,
        { item_id: bizItem.id, done: true });
      s.check('creator cannot tick a business-owned checklist item',
        crossTick.status === 403,
        { severity: 'HIGH', observed: `${crossTick.status} ${JSON.stringify(crossTick.body).slice(0, 180)}`,
          expected: 403, note: `item: "${bizItem.label}"` });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('THE SIGN-OFF RACE (lost-update probe)');

  // Both sides sign off the same stage at the same instant. The handler reads
  // stage_progress, mutates it in JS, and writes the WHOLE jsonb back — if
  // there is no optimistic lock or atomic jsonb update, the second write
  // clobbers the first, both sides believe they signed, and the stage sticks.
  if (lifecycle) {
    await sql(`update campaign_projects set current_stage='collaboration_started',
               stage_progress='{}'::jsonb where id=${lit(lifecycle)}`);
    await sql(`update project_stage_items set done_at=now(), done_by=${lit(uid('mamaearth'))}
               where project_id=${lit(lifecycle)} and stage_key='collaboration_started'`);

    const race = await raceAll([
      () => A.mamaearth.patch(`/api/projects/${lifecycle}`, { action: 'signoff' }),
      () => A.sourav.patch(`/api/projects/${lifecycle}`, { action: 'signoff' }),
    ]);
    s.note('  simultaneous sign-off →', race.map((r) => r.status));

    const after = await currentStage(lifecycle);
    const entry = (after.stage_progress || {}).collaboration_started || {};
    s.note('  stage_progress after the race', entry);

    const bothRecorded = Boolean(entry.owner_signoff_at) && Boolean(entry.creator_signoff_at);
    s.check('both sign-offs survive a simultaneous write',
      bothRecorded,
      { severity: 'HIGH', observed: `owner=${entry.owner_signoff_at || 'MISSING'} creator=${entry.creator_signoff_at || 'MISSING'}`,
        expected: 'both timestamps present',
        note: 'Lost update: the PATCH handler does read-modify-write on the stage_progress ' +
              'jsonb column with no optimistic lock, so two concurrent sign-offs can ' +
              'overwrite each other.' });

    s.check('the stage actually advanced after both sides signed off',
      after.current_stage === 'project_discussion',
      { severity: 'HIGH', observed: after.current_stage, expected: 'project_discussion',
        note: 'If both sides signed off but the stage did not move, the project is stuck ' +
              'and only a re-click (or support) unsticks it.' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Full 12-stage walk');

  if (lifecycle) {
    // Deterministic unpaid state. Phase 5 pays for this same project, so on a
    // re-run (or an out-of-order run) the gate would already be open and this
    // walk would prove nothing about the unpaid case.
    await sql(`
      begin;
      update campaign_projects set current_stage='collaboration_started',
             stage_progress='{}'::jsonb where id=${lit(lifecycle)};
      update project_stage_items set done_at=null, done_by=null where project_id=${lit(lifecycle)};
      delete from project_payments where project_id=${lit(lifecycle)};
      commit;
      select 1 as ok;`);

    const walk = [];
    let guard = 0;
    let stage = 'collaboration_started';
    while (stage !== 'project_completed' && guard++ < 20) {
      const step = await passStage(lifecycle, A.mamaearth, A.sourav);
      walk.push(step);
      s.note(`  ${step.from} → ${step.to}`, step.moved ? `via ${step.how}` : `STUCK (via ${step.how})`);
      if (!step.moved) {
        const detail = step.responses.filter((r) => r.res)
          .map((r) => `${r.who}: ${r.res.status} ${JSON.stringify(r.res.body).slice(0, 160)}`);
        if (step.from === 'advance_payment') {
          // Expected: this walk never paid. Recorded as context, asserted below.
          s.note(`  blocked at advance_payment (expected — unpaid)`, detail);
        } else {
          s.check(`stage "${step.from}" can be completed`, false,
            { severity: 'HIGH', observed: detail, expected: 'stage advances',
              note: 'The project cannot progress past this stage through the API.' });
        }
        break;
      }
      stage = step.to;
    }

    const reached = walk.length ? walk[walk.length - 1].to : 'collaboration_started';

    // This walk deliberately does NOT pay. With Razorpay configured, the
    // advance_payment gate item opens only on a signed capture webhook, so an
    // unpaid project MUST stop dead here — that is the money gate doing its job,
    // not a defect. Phase 5 runs the same walk with real (test-mode) payments
    // and proves it reaches project_completed.
    s.check('an UNPAID project cannot advance past the advance_payment gate',
      reached === 'advance_payment',
      { severity: 'CRITICAL', observed: `reached ${reached} in ${walk.length} steps`,
        expected: 'advance_payment (blocked on the unpaid gate)' });

    // ── The revision loop, exercised on its own ──────────────────────────
    // The happy-path walk takes the sent_for_review → final_approval fork, so
    // `revisions` is never visited by it. The loop is where a stage machine
    // usually breaks (it is the only backward edge in ALLOWED_TRANSITIONS), so
    // it gets driven explicitly, twice, to prove it can be re-entered.
    s.section('Revision loop');

    await sql(`
      begin;
      update campaign_projects set current_stage='sent_for_review',
             stage_progress='{}'::jsonb where id=${lit(lifecycle)};
      update project_stage_items set done_at=now(), done_by=${lit(uid('sourav'))}
             where project_id=${lit(lifecycle)};
      commit;
      select 1 as ok;`);

    const loop = [];
    for (let round = 1; round <= 2; round++) {
      const toRev = await A.mamaearth.patch(`/api/projects/${lifecycle}`,
        { action: 'advance', stage_key: 'revisions' });
      const atRev = await currentStage(lifecycle);
      loop.push({ round, step: 'to revisions', status: toRev.status, stage: atRev.current_stage });

      const back = await A.sourav.patch(`/api/projects/${lifecycle}`, { action: 'advance' });
      const atRev2 = await currentStage(lifecycle);
      loop.push({ round, step: 'back to review', status: back.status, stage: atRev2.current_stage });
    }
    loop.forEach((l) => s.note(`  round ${l.round} ${l.step}`, `${l.status} → ${l.stage}`));

    s.check('the brand can send a draft back for revisions',
      loop[0].stage === 'revisions',
      { severity: 'HIGH', observed: loop[0], expected: 'stage becomes revisions' });

    s.check('a resubmitted revision returns to sent_for_review (not straight to approval)',
      loop[1].stage === 'sent_for_review',
      { severity: 'CRITICAL', observed: loop[1],
        expected: 'sent_for_review',
        note: 'ALLOWED_TRANSITIONS.revisions has exactly one edge, back to review. ' +
              'Skipping it would let a brand approve final content it never re-saw.' });

    s.check('the revision loop can be re-entered more than once',
      loop[2].stage === 'revisions' && loop[3].stage === 'sent_for_review',
      { severity: 'HIGH', observed: loop.slice(2), expected: 'a second round behaves like the first' });

    // The creator must not be able to skip their own rework.
    await sql(`update campaign_projects set current_stage='revisions' where id=${lit(lifecycle)}`);
    const skipRev = await A.sourav.patch(`/api/projects/${lifecycle}`,
      { action: 'propose_skip', stage_key: 'revisions' });
    s.check('the revisions stage cannot be skipped',
      skipRev.status >= 400,
      { severity: 'HIGH', observed: `${skipRev.status} ${JSON.stringify(skipRev.body).slice(0, 160)}`,
        expected: '4xx' });

    // Asked as the CREATOR: revisions is a creator-actor stage, so the brand is
    // refused by the actor check (403) before the transition map is ever
    // consulted. Testing it as the brand would prove the wrong guard.
    const jumpFromRev = await A.sourav.patch(`/api/projects/${lifecycle}`,
      { action: 'advance', stage_key: 'final_approval' });
    const stageAfterJump = await currentStage(lifecycle);
    s.check('the creator cannot skip re-review by jumping revisions → final_approval',
      jumpFromRev.status === 400 && stageAfterJump.current_stage === 'revisions',
      { severity: 'CRITICAL',
        observed: `${jumpFromRev.status} ${JSON.stringify(jumpFromRev.body).slice(0, 160)} | stage=${stageAfterJump.current_stage}`,
        expected: '400 and the stage stays at revisions' });

    // And the brand is refused too, by the actor check rather than the map.
    const brandFromRev = await A.mamaearth.patch(`/api/projects/${lifecycle}`,
      { action: 'advance', stage_key: 'final_approval' });
    s.check('the brand cannot advance out of the creator-owned revisions stage',
      brandFromRev.status === 403,
      { severity: 'HIGH', observed: `${brandFromRev.status} ${JSON.stringify(brandFromRev.body).slice(0, 160)}`,
        expected: 403 });

    saveState('phase4-project', { projectId: lifecycle, walk: walk.map((w) => ({ from: w.from, to: w.to, how: w.how })) });
  }

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
