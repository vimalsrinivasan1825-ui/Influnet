// Phase 3 — discovery, collab requests, and the concurrency scenarios.
//
// The headline scenario is the one the user asked for by name: several
// businesses sending a request to the SAME creator at the SAME instant. That is
// where a request table without the right uniqueness constraint, or a notify
// path that assumes one-at-a-time, actually breaks.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phase3-requests.mjs

import { Actor, raceAll } from './lib/actor.mjs';
import { Scenario, loadPersonaState, saveState, sleep } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { ALL_PERSONAS, personaByKey } from './lib/personas.mjs';

const s = new Scenario('phase3-requests', 'Phase 3 — discovery, requests & concurrency');

// Response envelopes differ per route in this codebase (documented hazard —
// /api/discover returns {results}, /api/collabs returns {collabs}, /api/blocks
// returns {blocks}). Reading the route is the only reliable way; guessing with
// a chain of ?? fallbacks silently yields [] and manufactures false findings.
const listOf = (body, key) =>
  Array.isArray(body) ? body : (Array.isArray(body?.[key]) ? body[key] : []);

async function main() {
  const state = loadPersonaState();
  const actors = {};
  for (const [key, info] of Object.entries(state.actors)) {
    const a = new Actor(personaByKey(key));
    await a.signIn();
    actors[key] = a;
  }
  console.log(`Signed in ${Object.keys(actors).length} actors\n`);

  // Idempotence: wipe the relationship graph between audit personas so a re-run
  // starts from "no requests exist". Without this the duplicate/race checks are
  // measuring the previous run's rows.
  const allIds = Object.values(actors).map((a) => lit(a.userId)).join(',');
  await sql(`
    begin;
    delete from project_stage_items where project_id in (select id from campaign_projects where owner_user_id in (${allIds}) or counterparty_user_id in (${allIds}));
    delete from project_stage_entries where project_id in (select id from campaign_projects where owner_user_id in (${allIds}) or counterparty_user_id in (${allIds}));
    delete from project_activity where project_id in (select id from campaign_projects where owner_user_id in (${allIds}) or counterparty_user_id in (${allIds}));
    delete from project_payments where project_id in (select id from campaign_projects where owner_user_id in (${allIds}) or counterparty_user_id in (${allIds}));
    delete from campaign_projects where owner_user_id in (${allIds}) or counterparty_user_id in (${allIds});
    delete from project_proposals where proposed_by in (${allIds});
    delete from messages where conversation_id in (select conversation_id from conversation_participants where user_id in (${allIds}));
    delete from conversation_participants where user_id in (${allIds});
    delete from conversations where id not in (select conversation_id from conversation_participants);
    delete from collab_requests where from_user_id in (${allIds}) or to_user_id in (${allIds});
    delete from user_blocks where blocker_id in (${allIds}) or blocked_id in (${allIds});
    commit;
    select 1 as ok;`);
  console.log('Reset relationship graph between audit personas\n');

  const creators = ['sourav', 'masoom', 'nagma', 'nisha', 'kiran', 'arjunfit'];
  const businesses = ['mamaearth', 'boat', 'sugar', 'wakefit', 'plum'];
  const uid = (k) => actors[k].userId;

  // ══════════════════════════════════════════════════════════════════════
  s.section('Discovery');

  const disc = await actors.mamaearth.get('/api/discover');
  s.check('GET /api/discover succeeds for a business', disc.status === 200,
    { severity: 'HIGH', observed: disc.status, expected: 200 });

  const list = listOf(disc.body, 'results');
  s.note('discover returned', `${list.length} creators`);

  if (list.length) {
    const usernames = list.map((c) => c.username || c.creator_username).filter(Boolean);
    // The nano creator must be discoverable — a marketplace that only surfaces
    // mega accounts has no long tail, and 41k-follower creators are the volume
    // business.
    s.check('nano-tier creator (41k followers) appears in discovery',
      usernames.includes('nishaanand'),
      { severity: 'MEDIUM', observed: usernames.slice(0, 20), expected: 'includes nishaanand' });
    // The Instagram-less creator must also be discoverable.
    s.check('YouTube-only creator appears in discovery',
      usernames.includes('kiranrural'),
      { severity: 'MEDIUM', observed: usernames.slice(0, 20), expected: 'includes kiranrural' });
  }

  // A creator should not be able to browse the creator directory as a business.
  const discAsCreator = await actors.sourav.get('/api/discover');
  s.note('GET /api/discover as a creator', discAsCreator.status);

  // Unauthenticated
  const anon = new Actor({ key: 'anon', role: null, email: '', password: '' });
  const discAnon = await anon.get('/api/discover');
  s.check('GET /api/discover rejects unauthenticated callers',
    discAnon.status === 401 || discAnon.status === 403,
    { severity: 'HIGH', observed: discAnon.status, expected: '401/403' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('THE RACE: 5 businesses → 1 creator, simultaneously');

  const target = uid('sourav');
  const before = await sql(
    `select count(*)::int as n from collab_requests where to_user_id = ${lit(target)}`);

  const results = await raceAll(businesses.map((b) => () =>
    actors[b].post('/api/collabs', {
      to_user_id: target,
      project_title: `${personaByKey(b).companyName} × Sourav Joshi`,
      project_description: 'Simultaneous-send concurrency probe.',
      budget: 250000,
    })));

  results.forEach((r, i) => s.note(`  ${businesses[i]} →`, r.status));
  const created = results.filter((r) => r.status === 200 || r.status === 201).length;
  s.check('all 5 simultaneous requests from DIFFERENT businesses succeed',
    created === 5, { severity: 'HIGH', observed: `${created}/5 succeeded`, expected: '5/5',
      note: 'Different senders are independent; none should block another.' });

  const after = await sql(
    `select from_user_id, count(*)::int as n from collab_requests
     where to_user_id = ${lit(target)} group by from_user_id`);
  s.check('exactly one request row per sending business',
    after.every((r) => r.n === 1) && after.length === created,
    { severity: 'HIGH', observed: after, expected: 'one row per sender' });

  // ── the real uniqueness test: ONE business, 5 identical sends at once ──
  const target2 = uid('masoom');
  const dupResults = await raceAll(Array.from({ length: 5 }, () => () =>
    actors.boat.post('/api/collabs', {
      to_user_id: target2,
      project_title: 'boAt × Masoom — duplicate probe',
      project_description: 'Five identical requests fired simultaneously.',
      budget: 400000,
    })));
  dupResults.forEach((r, i) => s.note(`  boat dup #${i + 1} →`, r.status));

  const dupRows = await sql(
    `select count(*)::int as n from collab_requests
     where from_user_id = ${lit(uid('boat'))} and to_user_id = ${lit(target2)}`);
  s.check('5 identical simultaneous requests create only ONE row',
    dupRows[0].n === 1,
    { severity: 'HIGH', observed: `${dupRows[0].n} rows`, expected: '1 row',
      note: 'Needs a UNIQUE constraint on (from_user_id, to_user_id) for pending requests — ' +
            'an application-level check loses this race by construction.' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Request guards');

  // Sequential duplicate (the non-race case) must be a clean 409.
  const seqDup = await actors.boat.post('/api/collabs', {
    to_user_id: target2, project_title: 'boAt × Masoom — sequential duplicate', budget: 400000,
  });
  s.check('sequential duplicate request is refused with 409',
    seqDup.status === 409,
    { severity: 'MEDIUM', observed: `${seqDup.status} ${JSON.stringify(seqDup.body).slice(0, 120)}`, expected: 409 });

  // A creator must not be able to send a collab request (business-only route).
  const creatorSend = await actors.sourav.post('/api/collabs', {
    to_user_id: uid('mamaearth'), project_title: 'creator-initiated request', budget: 1000,
  });
  s.check('creator cannot POST /api/collabs (business-only)',
    creatorSend.status === 403,
    { severity: 'HIGH', observed: creatorSend.status, expected: 403 });

  // Self-request.
  const selfReq = await actors.boat.post('/api/collabs', {
    to_user_id: uid('boat'), project_title: 'self request', budget: 1000,
  });
  s.check('business cannot send a collab request to itself',
    selfReq.status >= 400,
    { severity: 'MEDIUM', observed: `${selfReq.status} ${JSON.stringify(selfReq.body).slice(0, 150)}`,
      expected: '4xx' });

  // Business → business.
  const b2b = await actors.boat.post('/api/collabs', {
    to_user_id: uid('mamaearth'), project_title: 'business to business', budget: 1000,
  });
  s.check('business cannot send a collab request to another business',
    b2b.status >= 400,
    { severity: 'MEDIUM', observed: `${b2b.status} ${JSON.stringify(b2b.body).slice(0, 150)}`,
      expected: '4xx' });

  // Negative / absurd budget.
  const negBudget = await actors.wakefit.post('/api/collabs', {
    to_user_id: uid('nisha'), project_title: 'negative budget', budget: -50000,
  });
  s.check('negative budget is rejected', negBudget.status === 400,
    { severity: 'MEDIUM', observed: negBudget.status, expected: 400 });

  const hugeBudget = await actors.wakefit.post('/api/collabs', {
    to_user_id: uid('nisha'), project_title: 'absurd budget', budget: 999999999999,
  });
  s.note('budget of ₹999,999,999,999 →', `${hugeBudget.status} ${JSON.stringify(hugeBudget.body).slice(0, 120)}`);

  // Non-existent recipient.
  const ghost = await actors.wakefit.post('/api/collabs', {
    to_user_id: '00000000-0000-0000-0000-000000000000', project_title: 'ghost', budget: 1000,
  });
  s.check('request to a non-existent user is refused',
    ghost.status >= 400,
    { severity: 'MEDIUM', observed: ghost.status, expected: '4xx' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Unapproved business (pending_review) — the approval gate');

  // bewakoof was deliberately left in pending_review.
  const bew = new Actor(personaByKey('bewakoof'));
  await bew.signIn();
  const pendingSend = await bew.post('/api/collabs', {
    to_user_id: uid('nagma'), project_title: 'Bewakoof × Nagma', budget: 150000,
  });
  s.note('pending_review business sending a request →', pendingSend.status);
  s.check('pending_review business CAN send (documented 2026-07 design change)',
    pendingSend.status === 200 || pendingSend.status === 201,
    { severity: 'LOW', observed: pendingSend.status,
      expected: '200/201 — only `rejected` is blocked; creator sees an unverified flag' });

  // The creator must be able to SEE that the sender is unverified.
  const nagmaInbox = await actors.nagma.get('/api/collabs');
  const inbox = listOf(nagmaInbox.body, 'collabs');
  const fromBewakoof = inbox.find((r) => r.from_user_id === bew.userId);
  s.check('incoming request exposes the sender’s approval status to the creator',
    Boolean(fromBewakoof && 'sender_business_approval_status' in fromBewakoof),
    { severity: 'HIGH', observed: fromBewakoof ? Object.keys(fromBewakoof).filter((k) => k.includes('approval')) : 'request not found',
      expected: 'sender_business_approval_status present',
      note: 'Without this the creator cannot tell an unvetted brand from a vetted one — ' +
            'which is the entire justification for letting pending businesses send.' });

  // A REJECTED business must be blocked outright.
  await sql(`update business_profiles set approval_status='rejected' where user_id=${lit(bew.userId)}`);
  const rejectedSend = await bew.post('/api/collabs', {
    to_user_id: uid('arjunfit'), project_title: 'Bewakoof × Arjun (rejected sender)', budget: 100000,
  });
  s.check('REJECTED business is blocked from sending', rejectedSend.status === 403,
    { severity: 'CRITICAL', observed: `${rejectedSend.status} ${JSON.stringify(rejectedSend.body).slice(0, 150)}`,
      expected: 403 });
  await sql(`update business_profiles set approval_status='pending_review' where user_id=${lit(bew.userId)}`);

  // ══════════════════════════════════════════════════════════════════════
  s.section('Accept / decline races');

  // Sourav has 5 pending requests. Accept them all — a creator working with
  // several brands at once is normal, not an error.
  const souravInbox = await actors.sourav.get('/api/collabs');
  const sInbox = listOf(souravInbox.body, 'collabs')
    .filter((r) => r.to_user_id === uid('sourav') && r.status === 'pending');
  s.note('Sourav pending requests', sInbox.length);

  const acceptResults = await raceAll(sInbox.map((r) => () =>
    actors.sourav.patch('/api/collabs', { id: r.id, status: 'accepted' })));
  acceptResults.forEach((r, i) => s.note(`  accept #${i + 1} →`, r.status));
  const acceptedOk = acceptResults.filter((r) => r.ok).length;
  s.check('a creator can accept requests from multiple brands simultaneously',
    acceptedOk === sInbox.length,
    { severity: 'HIGH', observed: `${acceptedOk}/${sInbox.length}`, expected: 'all accepted' });

  // Double-accept the same request concurrently — must be idempotent, not two effects.
  const one = sInbox[0];
  if (one) {
    const doubles = await raceAll([
      () => actors.sourav.patch('/api/collabs', { id: one.id, status: 'accepted' }),
      () => actors.sourav.patch('/api/collabs', { id: one.id, status: 'declined' }),
    ]);
    s.note('  concurrent accept+decline on one request →', doubles.map((d) => d.status));
    const finalRow = await sql(`select status from collab_requests where id = ${lit(one.id)}`);
    s.check('concurrent accept+decline leaves one deterministic status',
      finalRow.length === 1 && ['accepted', 'declined'].includes(finalRow[0].status),
      { severity: 'MEDIUM', observed: finalRow, expected: 'exactly one of accepted/declined' });
  }

  // A third party must not be able to answer someone else's request.
  if (one) {
    const [pre] = await sql(`select status from collab_requests where id = ${lit(one.id)}`);
    const hijack = await actors.nagma.patch('/api/collabs', { id: one.id, status: 'cancelled' });
    s.check('a non-recipient cannot answer another creator’s request',
      hijack.status === 403 || hijack.status === 404,
      { severity: 'CRITICAL', observed: `${hijack.status} ${JSON.stringify(hijack.body).slice(0, 150)}`,
        expected: '403/404' });
    // Status check alone isn't proof — a route can return 403 after writing.
    const [post] = await sql(`select status from collab_requests where id = ${lit(one.id)}`);
    s.check('the hijack attempt did not mutate the request',
      post?.status === pre?.status,
      { severity: 'CRITICAL', observed: `before=${pre?.status} after=${post?.status}`,
        expected: 'status unchanged' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Blocks');

  const blockRes = await actors.nisha.post('/api/blocks', { blocked_id: uid('wakefit') });
  s.note('creator blocks a business →', `${blockRes.status} ${JSON.stringify(blockRes.body).slice(0, 120)}`);

  if (blockRes.ok) {
    const blockedSend = await actors.wakefit.post('/api/collabs', {
      to_user_id: uid('nisha'), project_title: 'Wakefit × Nisha (post-block)', budget: 20000,
    });
    s.check('a blocked business cannot send to the blocker',
      blockedSend.status === 403,
      { severity: 'CRITICAL', observed: `${blockedSend.status} ${JSON.stringify(blockedSend.body).slice(0, 150)}`,
        expected: 403 });

    // And in the other direction — a block is symmetric by design.
    const reverseSend = await actors.nisha.post('/api/conversations', { user_id: uid('wakefit') });
    s.note('blocker contacting the blocked party →', reverseSend.status);

    await actors.nisha.del('/api/blocks', { blocked_id: uid('wakefit') });
  }

  saveState('phase3-actors', Object.fromEntries(
    Object.entries(actors).map(([k, a]) => [k, { userId: a.userId }])));
  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
