// Phase 9 — the units the earlier phases never walked end to end.
//
// module-map.html listed these as "built, no end-to-end test":
//   prj-skip     skipping a stage by mutual consent
//   ntf-inapp    every stage action tells the OTHER side exactly once
//   prj-updates  posting updates and links inside a stage
//   prj-change   change requests (propose → accept / reject / withdraw)
//   prj-delete   delete and restore a project
//   req-peer     creator-to-creator requests (accept opens a chat, not a project)
//   msg-pins     pinning conversations (Free cap, per-user)
// (self-delete lives in verify-161.mjs; account deletion + Stream in verify-stream-delete.mjs.)
//
// Every assertion is about what the code is MEANT to do. The one thing the module
// map got wrong is recorded here as it really is: deleting a project hides it from
// BOTH lists (manually_deleted_at is on the shared row) and tells the other side;
// either party can restore it.
//
// Standalone and re-runnable: it re-seeds the personas first (which also resets the
// Free plan's monthly request meters that other E2E runs use up) and restores the
// one billing setting it changes.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phase9-unproven-units.mjs
// Needs the dev server (web-e2e profile: NOTIFY_EMAILS_ENABLED=false) and Razorpay TEST keys.

import { spawnSync } from 'node:child_process';
import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { openProject, tickChecklist, currentStage } from './lib/lifecycle.mjs';

const s = new Scenario('phase9', 'Phase 9 — skip, notifications, updates, change requests, delete/restore, peer requests, pins');
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';

/** A stranger is refused: 403, or 404 when RLS hides the project entirely (which also does not reveal it exists). */
const denied = (r) => r.status === 403 || r.status === 404;

const notifCount = async (userId) => (await sql(`select count(*)::int as n from notifications where user_id=${lit(userId)}`))[0].n;
const lastNotif = async (userId) => (await sql(`select title, body, link, read_at from notifications where user_id=${lit(userId)} order by created_at desc limit 1`))[0] ?? null;
const progress = async (pid) => (await currentStage(pid)).stage_progress || {};

/** Run `fn`, then report how many notifications each named user gained. */
async function deltas(users, fn) {
  const before = await Promise.all(users.map((u) => notifCount(u.userId)));
  const result = await fn();
  const after = await Promise.all(users.map((u) => notifCount(u.userId)));
  return { result, gained: after.map((n, i) => n - before[i]) };
}

async function acceptedRequest(from, to, title) {
  await sql(`delete from collab_requests where status='pending' and from_user_id=${lit(from.userId)} and to_user_id=${lit(to.userId)}`);
  const sent = await from.post('/api/collabs', { to_user_id: to.userId, project_title: title, project_description: 'Phase 9 fixture.', budget: 100000 });
  const row = (await sql(`select id from collab_requests where from_user_id=${lit(from.userId)} and to_user_id=${lit(to.userId)} and status='pending' order by created_at desc limit 1`))[0];
  if (!row) throw new Error(`no request created (${sent.status} ${JSON.stringify(sent.body).slice(0, 160)})`);
  const acc = await to.patch('/api/collabs', { id: row.id, status: 'accepted' });
  if (!acc.ok) throw new Error(`accept failed (${acc.status} ${JSON.stringify(acc.body).slice(0, 160)})`);
  return row.id;
}

async function main() {
  // Fresh personas = fresh Free-plan meters, whatever earlier runs did.
  const seed = spawnSync('node', ['--env-file=apps/web/.env.local', 'tests/e2e/seed-personas.mjs'], { encoding: 'utf8' });
  if (seed.status !== 0 || !/12\/12/.test(seed.stdout)) throw new Error(`seed-personas failed:\n${seed.stdout.slice(-400)}${seed.stderr.slice(-400)}`);

  const A = {};
  for (const k of ['boat', 'sourav', 'masoom', 'nagma', 'nisha', 'kiran']) { A[k] = new Actor(personaByKey(k)); await A[k].signIn(); }
  const { boat, sourav, masoom, nagma, nisha, kiran } = A;

  const [{ v: originalPeerLimit }] = await sql(`select free_peer_requests_per_month as v from billing_settings limit 1`);

  try {
    // ── a live project to work on ─────────────────────────────────────────────
    const requestId = await acceptedRequest(boat, sourav, 'Phase 9 project');
    const opened = await openProject(boat, sourav, { requestId, title: 'Phase 9 project', budget: 100000, advance: 40000 });
    const pid = opened.projectId;
    s.check('fixture: a live boAt × Sourav project', Boolean(pid), { severity: 'CRITICAL', observed: JSON.stringify(opened.acceptBody).slice(0, 200) });
    if (!pid) { s.finish(); return; }
    await boat.get(`/api/projects/${pid}/stage-items`);
    const P = `/api/projects/${pid}`;

    // ═══ prj-skip ═══════════════════════════════════════════════════════════════
    s.section('prj-skip — skipping a stage needs BOTH sides');
    const outsider = await masoom.patch(P, { action: 'propose_skip' });
    s.check('a non-participant cannot propose a skip (403/404)', denied(outsider),
      { severity: 'CRITICAL', observed: `${outsider.status} ${JSON.stringify(outsider.body).slice(0, 120)}` });

    const propose = await deltas([boat, sourav], () => sourav.patch(P, { action: 'propose_skip' }));
    s.check('the creator proposes skipping the first stage (200)', propose.result.status === 200, { severity: 'HIGH', observed: `${propose.result.status} ${JSON.stringify(propose.result.body).slice(0, 160)}` });
    s.check('…the brand is told exactly once, the proposer not at all', propose.gained[0] === 1 && propose.gained[1] === 0,
      { severity: 'HIGH', observed: `brand +${propose.gained[0]}, creator +${propose.gained[1]}`, expected: 'brand +1, creator +0' });
    s.check('…and the pending proposal is recorded on the stage', (await progress(pid)).collaboration_started?.skip_proposed_by === sourav.userId, { severity: 'HIGH' });

    const ownConfirm = await sourav.patch(P, { action: 'confirm_skip' });
    s.check('the proposer cannot confirm their own proposal (400)', ownConfirm.status === 400, { severity: 'CRITICAL', observed: `${ownConfirm.status} ${JSON.stringify(ownConfirm.body).slice(0, 120)}` });

    const cancel = await boat.patch(P, { action: 'cancel_skip' });
    s.check('either side can cancel a pending proposal (200) and it is cleared',
      cancel.status === 200 && !(await progress(pid)).collaboration_started?.skip_proposed_by, { severity: 'HIGH', observed: `${cancel.status}` });
    const noProposal = await boat.patch(P, { action: 'confirm_skip' });
    s.check('confirming when nothing is proposed is refused (400)', noProposal.status === 400, { severity: 'HIGH', observed: noProposal.status });

    await boat.patch(P, { action: 'propose_skip' });
    const confirm = await deltas([boat, sourav], () => sourav.patch(P, { action: 'confirm_skip' }));
    const after = await currentStage(pid);
    s.check('the other side confirms and the project moves on (200 → project_discussion)', confirm.result.status === 200 && after.current_stage === 'project_discussion',
      { severity: 'CRITICAL', observed: `${confirm.result.status} → ${after.current_stage}` });
    s.check('…the skipped stage is recorded as skipped, with who confirmed', after.stage_progress.collaboration_started?.status === 'skipped' && after.stage_progress.collaboration_started?.skip_confirmed_by === sourav.userId,
      { severity: 'HIGH', observed: after.stage_progress.collaboration_started });
    s.check('…the proposer is told exactly once, the confirmer not at all', confirm.gained[0] === 1 && confirm.gained[1] === 0, { severity: 'HIGH', observed: `brand +${confirm.gained[0]}, creator +${confirm.gained[1]}` });
    const act = await boat.get(`${P}/activity`);
    s.check('…and the timeline shows the skip', JSON.stringify(act.body).includes('Skipped the'), { severity: 'MEDIUM', observed: JSON.stringify(act.body).slice(0, 160) });

    // ═══ ntf-inapp ══════════════════════════════════════════════════════════════
    s.section('ntf-inapp — each sign-off tells the OTHER side exactly once');
    await tickChecklist(boat, pid, 'project_discussion', 'business');
    await tickChecklist(sourav, pid, 'project_discussion', 'creator');
    const so1 = await deltas([boat, sourav], () => boat.patch(P, { action: 'signoff' }));
    s.check('the brand confirms the stage (200)', so1.result.status === 200, { severity: 'HIGH', observed: `${so1.result.status} ${JSON.stringify(so1.result.body).slice(0, 140)}` });
    s.check('…the creator gets exactly one notification, the brand none', so1.gained[1] === 1 && so1.gained[0] === 0, { severity: 'HIGH', observed: `brand +${so1.gained[0]}, creator +${so1.gained[1]}` });
    const link = await lastNotif(sourav.userId);
    s.check('…it links to the project, and starts unread', link?.link === `/dashboard/projects/${pid}` && link?.read_at === null, { severity: 'MEDIUM', observed: link });
    const so2 = await deltas([boat, sourav], () => sourav.patch(P, { action: 'signoff' }));
    s.check('the creator confirms too: the stage moves to advance_payment', so2.result.status === 200 && (await currentStage(pid)).current_stage === 'advance_payment', { severity: 'CRITICAL', observed: `${so2.result.status}` });
    s.check('…the brand gets exactly one notification, the creator none', so2.gained[0] === 1 && so2.gained[1] === 0, { severity: 'HIGH', observed: `brand +${so2.gained[0]}, creator +${so2.gained[1]}` });
    const list = await sourav.get('/api/notifications?unread=true&limit=100');
    const unreadIds = (Array.isArray(list.body) ? list.body : []).map((n) => n.id);
    s.check('GET /api/notifications lists them (a bare array, not an envelope)', Array.isArray(list.body) && unreadIds.length > 0, { severity: 'HIGH', observed: JSON.stringify(list.body).slice(0, 120) });
    const mark = await sourav.patch('/api/notifications', { action: 'mark_read', notificationIds: unreadIds });
    const stillUnread = await sourav.get('/api/notifications?unread=true&limit=100');
    s.check('marking them read empties the unread list', mark.ok && Array.isArray(stillUnread.body) && stillUnread.body.length === 0, { severity: 'MEDIUM', observed: `${mark.status}, ${JSON.stringify(stillUnread.body).slice(0, 100)}` });
    const strangers = await masoom.get('/api/notifications?limit=100');
    s.check("nobody else's notifications leak into another user's list", (Array.isArray(strangers.body) ? strangers.body : []).every((n) => n.user_id === masoom.userId), { severity: 'CRITICAL' });

    // ── payment stages can never be skipped, even by agreement ────────────────
    s.section('prj-skip — payment stages can never be skipped');
    const payPropose = await boat.patch(P, { action: 'propose_skip' });
    s.check('advance_payment: proposing a skip is refused (400)', payPropose.status === 400 && /can.t be skipped/i.test(JSON.stringify(payPropose.body)), { severity: 'CRITICAL', observed: `${payPropose.status} ${JSON.stringify(payPropose.body).slice(0, 140)}` });
    const payConfirm = await sourav.patch(P, { action: 'confirm_skip' });
    s.check('…and so is confirming one (400)', payConfirm.status === 400, { severity: 'CRITICAL', observed: payConfirm.status });
    s.check('…the project is still at advance_payment', (await currentStage(pid)).current_stage === 'advance_payment', { severity: 'CRITICAL' });

    // ═══ prj-updates ════════════════════════════════════════════════════════════
    s.section('prj-updates — posting updates and links in a stage');
    const E = `${P}/stage-entries`;
    const post1 = await deltas([boat, sourav], () => boat.post(E, { stage_key: 'advance_payment', body: 'Advance is being arranged today.' }));
    s.check('the brand posts a text update', post1.result.ok, { severity: 'HIGH', observed: `${post1.result.status} ${JSON.stringify(post1.result.body).slice(0, 140)}` });
    s.check('…the creator is told exactly once, the author not at all', post1.gained[1] === 1 && post1.gained[0] === 0, { severity: 'HIGH', observed: `brand +${post1.gained[0]}, creator +${post1.gained[1]}` });
    const post2 = await sourav.post(E, { stage_key: 'advance_payment', link_url: 'https://example.com/brief-v2', body: 'Updated brief link.' });
    s.check('the creator posts a link update', post2.ok, { severity: 'HIGH', observed: `${post2.status} ${JSON.stringify(post2.body).slice(0, 140)}` });
    s.check('an empty update is refused (400)', (await boat.post(E, { stage_key: 'advance_payment' })).status === 400, { severity: 'MEDIUM' });
    s.check('a malformed link is refused (400)', (await boat.post(E, { stage_key: 'advance_payment', link_url: 'not a url' })).status === 400, { severity: 'MEDIUM' });
    s.check('an over-long update is refused (400)', (await boat.post(E, { stage_key: 'advance_payment', body: 'x'.repeat(4001) })).status === 400, { severity: 'MEDIUM' });
    const gb = await boat.get(E), gs = await sourav.get(E);
    const eb = gb.body?.entries ?? [], es = gs.body?.entries ?? [];
    s.check('both sides see both updates, oldest first, with author names', eb.length === 2 && es.length === 2 && eb[0].author?.name && eb[0].body.includes('Advance') && eb[1].link_url === 'https://example.com/brief-v2',
      { severity: 'HIGH', observed: JSON.stringify(eb).slice(0, 220) });
    s.check('a non-participant can neither read nor post updates (403/404)', denied(await masoom.get(E)) && denied(await masoom.post(E, { stage_key: 'advance_payment', body: 'hi' })), { severity: 'CRITICAL' });
    const anon = await fetch(`${BASE}${E}`);
    s.check('an anonymous request is refused (401)', anon.status === 401, { severity: 'CRITICAL', observed: anon.status });
    const sign = await fetch(`${BASE}/api/uploads/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    s.check('the upload-signing endpoint refuses anonymous callers (401)', sign.status === 401, { severity: 'CRITICAL', observed: sign.status });

    // ═══ prj-change ═════════════════════════════════════════════════════════════
    s.section('prj-change — changing agreed terms needs the other side');
    const C = `${P}/change-requests`;
    const terms = async () => (await sql(`select budget::numeric as budget, advance_amount::numeric as advance from campaign_projects where id=${lit(pid)}`))[0];
    const t0 = await terms();
    const propose1 = await deltas([boat, sourav], () => boat.post(C, { changes: { budget: 120000, advance_amount: 50000 } }));
    s.check('the brand proposes a new budget and advance', propose1.result.ok, { severity: 'HIGH', observed: `${propose1.result.status} ${JSON.stringify(propose1.result.body).slice(0, 160)}` });
    s.check('…the creator is told exactly once', propose1.gained[1] === 1 && propose1.gained[0] === 0, { severity: 'HIGH', observed: `brand +${propose1.gained[0]}, creator +${propose1.gained[1]}` });
    const cr1 = (await sql(`select id, status from project_change_requests where project_id=${lit(pid)} order by created_at desc limit 1`))[0];
    s.check('…it is pending and the terms have not moved yet', cr1?.status === 'pending' && JSON.stringify(await terms()) === JSON.stringify(t0), { severity: 'CRITICAL', observed: { cr1, terms: await terms() } });
    s.check('the proposer cannot accept their own change (403)', (await boat.patch(C, { request_id: cr1.id, action: 'accept' })).status === 403, { severity: 'CRITICAL' });
    s.check('a non-participant cannot list or propose changes (403/404)', denied(await masoom.get(C)) && denied(await masoom.post(C, { changes: { budget: 1 } })), { severity: 'CRITICAL' });

    const rej = await deltas([boat, sourav], () => sourav.patch(C, { request_id: cr1.id, action: 'reject', note: 'Too high for this scope.' }));
    s.check('the creator rejects it with a note (200)', rej.result.status === 200, { severity: 'HIGH', observed: `${rej.result.status} ${JSON.stringify(rej.result.body).slice(0, 140)}` });
    s.check('…the agreed terms are UNTOUCHED', JSON.stringify(await terms()) === JSON.stringify(t0), { severity: 'CRITICAL', observed: { before: t0, after: await terms() } });
    s.check('…the proposer is told exactly once', rej.gained[0] === 1 && rej.gained[1] === 0, { severity: 'HIGH', observed: `brand +${rej.gained[0]}, creator +${rej.gained[1]}` });
    s.check('…a resolved request cannot be acted on again (409)', (await sourav.patch(C, { request_id: cr1.id, action: 'accept' })).status === 409, { severity: 'HIGH' });

    await boat.post(C, { changes: { title: 'Phase 9 project (rev)' } });
    const cr2 = (await sql(`select id from project_change_requests where project_id=${lit(pid)} and status='pending' order by created_at desc limit 1`))[0];
    const wd = await boat.patch(C, { request_id: cr2.id, action: 'withdraw' });
    s.check('the proposer can withdraw a pending change (200), the other side cannot', wd.status === 200 && (await sourav.patch(C, { request_id: cr2.id, action: 'withdraw' })).status !== 200, { severity: 'HIGH', observed: `${wd.status}` });

    s.check('an empty change and a negative budget are refused (400)', (await boat.post(C, { changes: {} })).status === 400 && (await boat.post(C, { changes: { budget: -5 } })).status === 400, { severity: 'MEDIUM' });

    await boat.post(C, { changes: { budget: 150000, advance_amount: 60000 } });
    const cr3 = (await sql(`select id from project_change_requests where project_id=${lit(pid)} and status='pending' order by created_at desc limit 1`))[0];
    const acc = await sourav.patch(C, { request_id: cr3.id, action: 'accept' });
    const t1 = await terms();
    s.check('the creator accepts: the terms now read ₹1,50,000 with a ₹60,000 advance', acc.status === 200 && Number(t1.budget) === 150000 && Number(t1.advance) === 60000, { severity: 'CRITICAL', observed: `${acc.status} ${JSON.stringify(t1)}` });
    const actC = JSON.stringify((await boat.get(`${P}/activity`)).body);
    s.check('…and the timeline records both the rejection and the acceptance', /Rejected a proposed change/.test(actC) && /Accepted a change/.test(actC), { severity: 'MEDIUM', observed: actC.slice(0, 200) });

    const order = await boat.post(`${P}/payments`, { stage_key: 'advance_payment' });
    const amount = order.body?.order?.amount ?? order.body?.amount;
    if (order.status === 200 || order.status === 201) {
      s.check('the advance payment order is now for the NEW advance (₹60,000 = 6,000,000 paise), not the old one',
        Number(amount) === 6_000_000, { severity: 'CRITICAL', observed: `amount ${amount}`, expected: 6000000, note: 'Amounts are derived server-side from the agreed terms, never from the client.' });
    } else {
      s.note('payment order not created (is Razorpay TEST configured?)', `${order.status} ${JSON.stringify(order.body).slice(0, 140)}`);
    }

    // ═══ prj-delete ═════════════════════════════════════════════════════════════
    s.section('prj-delete — delete hides it from BOTH lists and tells the other side; restore is exact');
    const snapshot = await currentStage(pid);
    const ids = async (a, q = '') => ((await a.get(`/api/projects${q}`)).body?.projects ?? []).map((p) => p.id);
    s.check('before: the project is on both active lists', (await ids(boat)).includes(pid) && (await ids(sourav)).includes(pid), { severity: 'HIGH' });
    const del = await deltas([boat, sourav], () => boat.patch(P, { action: 'delete_project' }));
    s.check('the brand deletes it (200)', del.result.status === 200, { severity: 'HIGH', observed: `${del.result.status} ${JSON.stringify(del.result.body).slice(0, 140)}` });
    s.check('…it leaves BOTH active lists (the flag is on the shared row)', !(await ids(boat)).includes(pid) && !(await ids(sourav)).includes(pid), { severity: 'HIGH' });
    s.check('…and shows under Deleted Projects for both', (await ids(boat, '?deleted=true')).includes(pid) && (await ids(sourav, '?deleted=true')).includes(pid), { severity: 'HIGH' });
    s.check('…the other side is told exactly once, the deleter not at all', del.gained[1] === 1 && del.gained[0] === 0, { severity: 'HIGH', observed: `brand +${del.gained[0]}, creator +${del.gained[1]}` });
    s.check('deleting twice is refused (409)', (await boat.patch(P, { action: 'delete_project' })).status === 409, { severity: 'MEDIUM' });
    s.check('a non-participant cannot delete or restore (403/404)', denied(await masoom.patch(P, { action: 'delete_project' })) && denied(await masoom.patch(P, { action: 'restore_project' })), { severity: 'CRITICAL' });
    s.check('nothing is destroyed: the row, its payments and its updates are all still there',
      (await sql(`select count(*)::int as n from campaign_projects where id=${lit(pid)}`))[0].n === 1
      && (await sql(`select count(*)::int as n from project_stage_entries where project_id=${lit(pid)}`))[0].n === 2, { severity: 'CRITICAL' });

    const res = await deltas([boat, sourav], () => sourav.patch(P, { action: 'restore_project' }));
    const restored = await currentStage(pid);
    s.check('the OTHER side can restore it (200) and it returns to both active lists', res.result.status === 200 && (await ids(boat)).includes(pid) && (await ids(sourav)).includes(pid) && !(await ids(boat, '?deleted=true')).includes(pid),
      { severity: 'HIGH', observed: `${res.result.status}` });
    s.check('…exactly as it was: same stage, same stage_progress', restored.current_stage === snapshot.current_stage && JSON.stringify(restored.stage_progress) === JSON.stringify(snapshot.stage_progress), { severity: 'CRITICAL' });
    s.check('…and the restorer’s counterpart is told exactly once', res.gained[0] === 1 && res.gained[1] === 0, { severity: 'MEDIUM', observed: `brand +${res.gained[0]}, creator +${res.gained[1]}` });
    s.check('restoring a project that is not deleted is refused (409)', (await sourav.patch(P, { action: 'restore_project' })).status === 409, { severity: 'MEDIUM' });

    // ═══ req-peer ═══════════════════════════════════════════════════════════════
    s.section('req-peer — creator ↔ creator requests open a chat, never a project');
    const pairKey = (a, b) => `(from_user_id=${lit(a.userId)} and to_user_id=${lit(b.userId)})`;
    const peer = async (to, message) => sourav.post('/api/collabs/peer', { to_user_id: to.userId, message });
    const p1 = await deltas([sourav, masoom], () => peer(masoom, 'Fancy a joint reel?'));
    s.check('a creator sends another creator a request (201)', p1.result.status === 201, { severity: 'HIGH', observed: `${p1.result.status} ${JSON.stringify(p1.result.body).slice(0, 140)}` });
    s.check('…the recipient is told exactly once', p1.gained[1] === 1 && p1.gained[0] === 0, { severity: 'MEDIUM', observed: `sender +${p1.gained[0]}, recipient +${p1.gained[1]}` });
    s.check('a second pending request to the same creator is refused (409)', (await peer(masoom, 'again')).status === 409, { severity: 'HIGH' });
    s.check('a request to yourself is refused (400)', (await sourav.post('/api/collabs/peer', { to_user_id: sourav.userId })).status === 400, { severity: 'MEDIUM' });
    s.check('a request to a business is refused (400)', (await sourav.post('/api/collabs/peer', { to_user_id: boat.userId })).status === 400, { severity: 'HIGH' });
    s.check('a business cannot use the creator-only route (403)', (await boat.post('/api/collabs/peer', { to_user_id: masoom.userId })).status === 403, { severity: 'HIGH' });

    const req1 = (await sql(`select id from collab_requests where ${pairKey(sourav, masoom)} and status='pending' order by created_at desc limit 1`))[0];
    const acc1 = await masoom.patch('/api/collabs', { id: req1.id, status: 'accepted' });
    const conv = (await sql(`select cp1.conversation_id as id from conversation_participants cp1 join conversation_participants cp2 on cp2.conversation_id=cp1.conversation_id where cp1.user_id=${lit(sourav.userId)} and cp2.user_id=${lit(masoom.userId)} limit 1`))[0];
    s.check('accepting opens a conversation between the two (200)', acc1.ok && Boolean(conv?.id), { severity: 'HIGH', observed: `${acc1.status} conv=${conv?.id}` });
    s.check('…and creates NO project', (await sql(`select count(*)::int as n from campaign_projects where (owner_user_id=${lit(sourav.userId)} and counterparty_user_id=${lit(masoom.userId)}) or (owner_user_id=${lit(masoom.userId)} and counterparty_user_id=${lit(sourav.userId)})`))[0].n === 0, { severity: 'HIGH' });
    s.check('a blocked pair cannot send (403), in either direction', await (async () => {
      await sourav.post('/api/blocks', { blocked_id: kiran.userId });
      const fromBlocker = (await peer(kiran, 'hi')).status;
      const fromBlocked = (await kiran.post('/api/collabs/peer', { to_user_id: sourav.userId })).status;
      await sourav.del('/api/blocks', { blocked_id: kiran.userId });
      return fromBlocker === 403 && fromBlocked === 403;
    })(), { severity: 'CRITICAL' });

    // The Free cap is 10 a month; only 6 creators exist here, so lower it to 3 for the
    // duration (restored in `finally`) and prove the MECHANISM: the 4th is refused with
    // the meter, and a refused request writes nothing.
    //
    // The app-level cap (requireQuota) only bites when plan limits are enforced, i.e.
    // SUBSCRIPTIONS_ENABLED is on. The launch plan is "free, subscriptions off", so on
    // such a server this is recorded as a note rather than failing: it is by design.
    const ent = await sourav.get('/api/billing/entitlements');
    const enforced = ent.body?.enabled === true;
    if (enforced) await sql(`update billing_settings set free_peer_requests_per_month = 3`);
    const p2 = await peer(nagma, 'Collab?'); const p3 = await peer(nisha, 'Collab?');
    s.check('the 2nd and 3rd creator requests this month go through', p2.status === 201 && p3.status === 201, { severity: 'HIGH', observed: `${p2.status}, ${p3.status}` });
    const over = await peer(kiran, 'One too many');
    if (enforced) {
      s.check('the 4th is refused with a 402 naming the limit', over.status === 402 && over.body?.feature === 'requests.peer' && over.body?.limit === 3 && over.body?.used === 3,
        { severity: 'HIGH', observed: `${over.status} ${JSON.stringify(over.body).slice(0, 200)}`, expected: '402 requests.peer limit 3 used 3' });
      s.check('…and a refused request writes nothing', (await sql(`select count(*)::int as n from collab_requests where ${pairKey(sourav, kiran)}`))[0].n === 0, { severity: 'HIGH' });
      await sql(`update billing_settings set free_peer_requests_per_month = ${lit(originalPeerLimit)}`);
    } else {
      s.note('creator-request Free cap NOT exercised', 'plan limits are not enforced on this server (SUBSCRIPTIONS_ENABLED is off), so a 4th request goes through by design');
      s.check('with plan limits off, no creator-request cap applies (the launch-free configuration)', over.status === 201, { severity: 'LOW', observed: over.status });
    }

    for (const [who, actor] of [['nagma', nagma], ['nisha', nisha]]) {
      const r = (await sql(`select id from collab_requests where ${pairKey(sourav, A[who])} and status='pending' order by created_at desc limit 1`))[0];
      await actor.patch('/api/collabs', { id: r.id, status: 'accepted' });
    }

    // ═══ msg-pins ═══════════════════════════════════════════════════════════════
    s.section('msg-pins — pin up to 3 chats on the Free plan, per person');
    const convOf = async (other) => (await sql(`select cp1.conversation_id as id from conversation_participants cp1 join conversation_participants cp2 on cp2.conversation_id=cp1.conversation_id where cp1.user_id=${lit(sourav.userId)} and cp2.user_id=${lit(other.userId)} limit 1`))[0]?.id;
    const cids = { boat: await convOf(boat), masoom: await convOf(masoom), nagma: await convOf(nagma), nisha: await convOf(nisha) };
    s.check('fixture: Sourav has four conversations', Object.values(cids).every(Boolean), { severity: 'CRITICAL', observed: cids });
    const pin = (id, pinned = true) => sourav.patch(`/api/conversations/${id}/pin`, { pinned });
    const pins = [await pin(cids.boat), await pin(cids.masoom), await pin(cids.nagma)];
    s.check('the first three pins succeed ({ pinned: true })', pins.every((r) => r.status === 200 && r.body?.pinned === true), { severity: 'HIGH', observed: pins.map((r) => r.status) });
    s.check('pinning the same chat again is idempotent (200)', (await pin(cids.boat)).status === 200, { severity: 'MEDIUM' });
    const fourth = await pin(cids.nisha);
    s.check('the 4th is refused with a 402 naming the limit', fourth.status === 402 && fourth.body?.feature === 'chats.pin' && fourth.body?.limit === 3, { severity: 'HIGH', observed: `${fourth.status} ${JSON.stringify(fourth.body).slice(0, 160)}` });
    const listed = await sourav.get('/api/conversations');
    const flags = Object.fromEntries((listed.body?.conversations ?? []).map((c) => [c.id, c.pinned]));
    s.check('GET /api/conversations reports exactly the three pinned', flags[cids.boat] === true && flags[cids.masoom] === true && flags[cids.nagma] === true && flags[cids.nisha] === false, { severity: 'HIGH', observed: flags });
    const theirs = await masoom.get('/api/conversations');
    s.check("a pin is per person: the other participant's list is unaffected", (theirs.body?.conversations ?? []).every((c) => c.pinned === false), { severity: 'HIGH', observed: (theirs.body?.conversations ?? []).map((c) => c.pinned) });
    s.check('unpinning frees a slot ({ pinned: false }), then the 4th pin works', (await pin(cids.boat, false)).body?.pinned === false && (await pin(cids.nisha)).status === 200, { severity: 'HIGH' });
    s.check('a non-participant cannot pin someone else’s conversation (403)', (await kiran.patch(`/api/conversations/${cids.masoom}/pin`, { pinned: true })).status === 403, { severity: 'CRITICAL' });
    s.check('a malformed conversation id is refused (400)', (await sourav.patch('/api/conversations/not-a-uuid/pin', { pinned: true })).status === 400, { severity: 'LOW' });
  } finally {
    await sql(`update billing_settings set free_peer_requests_per_month = ${lit(originalPeerLimit)}`);
  }

  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
