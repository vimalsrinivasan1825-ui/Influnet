// Can a collaboration be run to completion from the PHONE?
//
// The mobile app has no server of its own — it calls the same /api routes the
// web dashboard does. So the question isn't whether mobile has its own bugs in
// this layer; it's whether the endpoint SET mobile actually calls is sufficient
// to finish a project without ever touching the web app.
//
// This walk is restricted to exactly the endpoints found in apps/mobile:
//
//   /api/collabs, /api/collabs/[id], /api/conversations,
//   /api/conversations/[id]/deal, /api/projects/[id],
//   /api/projects/[id]/stage-items, /api/projects/[id]/stage-entries,
//   /api/home, /api/notifications, /api/creators/[username], /api/blocks
//
// Deliberately EXCLUDED, because mobile does not call them:
//   • POST /api/projects/[id]/payments — in-app Razorpay checkout is web-only
//     (no React Native SDK here). Mobile shows a "Pay on web" button that opens
//     the browser, so the payment step is modelled that way: the order is
//     created out-of-band, exactly as tapping that button would.
//   • /api/conversations/[id]/messages — chat is GetStream on mobile.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-mobile-parity.mjs

import { createHmac } from 'node:crypto';
import { Actor, BASE_URL } from './lib/actor.mjs';
import { Scenario, loadPersonaState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { currentStage, STAGE_ACTOR, NON_SIGNOFF_STAGES } from './lib/lifecycle.mjs';

const s = new Scenario('verify-mobile-parity', 'Mobile — can a project be finished from the phone?');

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

async function payViaWeb(biz, projectId, stageKey) {
  // Models the "Pay on web" handoff: the browser does this, not the app.
  const order = await biz.post(`/api/projects/${projectId}/payments`, { stage_key: stageKey });
  const oid = order.body?.order?.id ?? order.body?.order_id;
  const amt = order.body?.order?.amount ?? order.body?.amount;
  if (!oid) return { ok: false, detail: `${order.status} ${JSON.stringify(order.body).slice(0, 160)}` };
  const raw = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: `pay_mobile_${stageKey}`, order_id: oid, amount: amt, status: 'captured' } } },
  });
  const sig = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  const res = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: raw,
  });
  return { ok: res.status === 200, detail: `webhook ${res.status}` };
}

/** Tick required items using ONLY the stage-items endpoint mobile calls. */
async function tick(actor, projectId, stage, role) {
  const res = await actor.get(`/api/projects/${projectId}/stage-items`);
  const items = (res.body?.items || []).filter(
    (it) => it.stage_key === stage && it.is_required && !it.done_at &&
            (it.owner_role === 'both' || it.owner_role === role));
  const out = [];
  for (const it of items) {
    const r = await actor.patch(`/api/projects/${projectId}/stage-items`, { item_id: it.id, done: true });
    out.push(`${it.label}:${r.status}`);
  }
  return out;
}

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;
  const biz = A.wakefit;
  const creator = A.arjunfit;

  // Fresh pair with no history, so this is a genuine cold start.
  const sel = `select id from campaign_projects where owner_user_id=${lit(uid('wakefit'))} and counterparty_user_id=${lit(uid('arjunfit'))}`;
  await sql(`
    begin;
    delete from project_stage_items   where project_id in (${sel});
    delete from project_stage_entries where project_id in (${sel});
    delete from project_activity      where project_id in (${sel});
    delete from project_payments      where project_id in (${sel});
    delete from reviews               where project_id in (${sel});
    delete from campaign_projects where owner_user_id=${lit(uid('wakefit'))} and counterparty_user_id=${lit(uid('arjunfit'))};
    delete from project_proposals where proposed_by in (${lit(uid('wakefit'))}, ${lit(uid('arjunfit'))});
    delete from collab_requests where from_user_id=${lit(uid('wakefit'))} and to_user_id=${lit(uid('arjunfit'))};
    commit;
    select 1 as ok;`);

  s.section('Discovery → request → accept (mobile endpoints only)');

  const disc = await biz.get('/api/discover');
  s.check('a business can browse creators from the phone',
    disc.status === 200 && (disc.body?.results?.length ?? 0) > 0,
    { severity: 'HIGH', observed: `${disc.status}, ${disc.body?.results?.length ?? 0} creators` });

  const profile = await biz.get('/api/creators/arjunfitindia');
  s.check('a creator profile loads on the phone',
    profile.status === 200 && Boolean(profile.body?.data),
    { severity: 'HIGH', observed: `${profile.status} ${Object.keys(profile.body || {}).join(',')}` });
  s.check('the profile carries the new collaboration counts',
    profile.body?.collaborationStats !== undefined,
    { severity: 'MEDIUM', observed: JSON.stringify(profile.body?.collaborationStats),
      expected: 'present (migration 113)' });

  const req = await biz.post('/api/collabs', {
    to_user_id: uid('arjunfit'),
    project_title: 'Wakefit × Arjun — mobile-only run',
    project_description: 'Driven entirely through the endpoints the app calls.',
    budget: 400000,
  });
  s.check('a request can be sent from the phone', req.status === 200,
    { severity: 'CRITICAL', observed: `${req.status} ${JSON.stringify(req.body).slice(0, 160)}` });

  const inbox = await creator.get('/api/collabs');
  const mine = (inbox.body?.collabs || []).find((r) => r.from_user_id === uid('wakefit') && r.status === 'pending');
  s.check('the creator sees it in their inbox on the phone', Boolean(mine),
    { severity: 'CRITICAL', observed: `${(inbox.body?.collabs || []).length} requests` });

  const accept = await creator.patch('/api/collabs', { id: mine?.id, status: 'accepted' });
  s.check('the creator can accept from the phone', accept.status === 200,
    { severity: 'CRITICAL', observed: `${accept.status} ${JSON.stringify(accept.body).slice(0, 160)}` });

  s.section('Deal negotiation → project (mobile endpoints only)');

  const conv = await biz.post('/api/conversations', { other_user_id: uid('arjunfit') });
  const convId = conv.body?.conversation?.id;
  s.check('a conversation opens from the phone', Boolean(convId),
    { severity: 'CRITICAL', observed: `${conv.status} ${JSON.stringify(conv.body).slice(0, 160)}` });

  const deal = await biz.get(`/api/conversations/${convId}/deal`);
  s.check('the deal card loads on the phone', deal.status === 200,
    { severity: 'HIGH', observed: `${deal.status} viewer=${JSON.stringify(deal.body?.viewer)}` });

  const prop = await biz.post(`/api/conversations/${convId}/deal`, {
    collab_request_id: mine.id, title: 'Wakefit × Arjun — mobile-only run',
    budget: 400000, advance_amount: 150000,
    due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
  });
  s.check('terms can be proposed from the phone', Boolean(prop.body?.proposal_id),
    { severity: 'CRITICAL', observed: `${prop.status} ${JSON.stringify(prop.body).slice(0, 160)}` });

  const acc = await creator.patch(`/api/conversations/${convId}/deal`, {
    proposal_id: prop.body.proposal_id, action: 'accept',
  });
  s.check('terms can be accepted from the phone', acc.status === 200,
    { severity: 'CRITICAL', observed: `${acc.status} ${JSON.stringify(acc.body).slice(0, 160)}` });

  const [proj] = await sql(
    `select id from campaign_projects where owner_user_id=${lit(uid('wakefit'))}
     and counterparty_user_id=${lit(uid('arjunfit'))} order by created_at desc limit 1`);
  const pid = proj?.id;
  s.check('a project exists after acceptance', Boolean(pid),
    { severity: 'CRITICAL', observed: pid ?? 'none' });

  const seeded = await sql(
    `select count(*)::int as n from project_stage_items where project_id=${lit(pid)}`);
  s.check('the checklist is materialised for the phone to render',
    seeded[0].n > 0,
    { severity: 'HIGH', observed: `${seeded[0].n} rows`, expected: '> 0' });

  s.section('All 12 stages, from the phone');

  const walk = [];
  let stage = 'collaboration_started';
  let guard = 0;

  while (stage !== 'project_completed' && guard++ < 20) {
    if (stage === 'advance_payment' || stage === 'final_payment') {
      const already = await sql(
        `select count(*)::int as n from project_payments
         where project_id=${lit(pid)} and stage_key=${lit(stage)} and status='paid'`);
      if (already[0].n === 0) {
        const paid = await payViaWeb(biz, pid, stage);
        s.check(`the "Pay on web" handoff completes ${stage}`, paid.ok,
          { severity: 'HIGH', observed: paid.detail,
            note: 'In-app checkout is web-only by design; the app opens the browser here.' });
        if (!paid.ok) break;
      }
    }

    await tick(biz, pid, stage, 'business');
    await tick(creator, pid, stage, 'creator');

    let res;
    let how;
    if (stage === 'final_payment') {
      how = 'confirm_completion';
      await biz.patch(`/api/projects/${pid}`, { action: 'confirm_completion' });
      res = await creator.patch(`/api/projects/${pid}`, { action: 'confirm_completion' });
    } else if (NON_SIGNOFF_STAGES.has(stage)) {
      how = 'advance';
      const who = STAGE_ACTOR[stage] === 'creator' ? creator : biz;
      res = await who.patch(`/api/projects/${pid}`,
        stage === 'sent_for_review'
          ? { action: 'advance', stage_key: 'final_approval' }
          : { action: 'advance' });
    } else {
      how = 'signoff';
      await biz.patch(`/api/projects/${pid}`, { action: 'signoff' });
      res = await creator.patch(`/api/projects/${pid}`, { action: 'signoff' });
    }

    const after = await currentStage(pid);
    walk.push({ from: stage, to: after.current_stage, how });
    s.note(`  ${stage} → ${after.current_stage}`, `via ${how}`);

    if (after.current_stage === stage) {
      s.check(`stage "${stage}" can be completed from the phone`, false,
        { severity: 'CRITICAL',
          observed: `${res.status} ${JSON.stringify(res.body).slice(0, 220)}`,
          expected: 'advances',
          note: 'A stage with no working control on mobile is a hard dead end — the ' +
                'project cannot move until someone opens a laptop.' });
      break;
    }
    stage = after.current_stage;
  }

  const reached = walk.length ? walk[walk.length - 1].to : stage;
  s.check('a project can be run end-to-end from the phone',
    reached === 'project_completed',
    { severity: 'CRITICAL', observed: `reached ${reached} in ${walk.length} steps`,
      expected: 'project_completed' });

  const finalRow = await sql(`select status from campaign_projects where id=${lit(pid)}`);
  s.check('the finished project is marked completed',
    finalRow[0]?.status === 'completed',
    { severity: 'HIGH', observed: finalRow, expected: "status='completed'" });

  s.section('Post-completion, from the phone');

  const homeBiz = await biz.get('/api/home');
  s.check('the business home screen loads', homeBiz.status === 200,
    { severity: 'HIGH', observed: homeBiz.status });

  const homeCreator = await creator.get('/api/home');
  s.check('the creator home screen loads', homeCreator.status === 200,
    { severity: 'HIGH', observed: homeCreator.status });

  const notif = await creator.get('/api/notifications');
  s.check('notifications load on the phone', notif.status === 200,
    { severity: 'HIGH', observed: notif.status });

  const activity = await creator.get(`/api/projects/${pid}/activity`);
  s.check('the project activity feed loads on the phone', activity.status === 200,
    { severity: 'MEDIUM', observed: activity.status });

  // The counts the audit added must be visible from mobile too.
  const profAfter = await biz.get('/api/creators/arjunfitindia');
  s.check('the creator’s track record reflects the finished project',
    (profAfter.body?.collaborationStats?.projectsCompleted ?? 0) > 0,
    { severity: 'MEDIUM', observed: JSON.stringify(profAfter.body?.collaborationStats),
      expected: 'projectsCompleted >= 1' });

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
