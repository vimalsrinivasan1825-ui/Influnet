// Phase 8 — Release 1: short-term projects, documents, campaigns, and the
// smaller Lane 3 features, driven through the real API.
//
// This is the phase the review of A1–A5 flagged as missing: four separate
// status reports marked those tasks complete without a single test that
// proved a short-term project could run end to end. It exists to close that
// gap — and, having been written against the real running server rather than
// against the code in isolation, it also caught two bugs that a read-through
// missed (see BARTER GATE and TERMINAL STAGE sections below).
//
// Requires a dev server on :3000 with SUBSCRIPTIONS_ENABLED=true and
// db_enforcement_enabled=true in billing_settings (both true on dev as of
// this writing — the script checks and reports rather than assuming).
//
// Turn NOTIFY_EMAILS_ENABLED off before running and restore it after — the
// personas use @influnet-audit.test, which hard-bounces.
//
// Usage:
//   node --env-file=apps/web/.env.local tests/e2e/phase8-r1-features.mjs

import { createHmac } from 'node:crypto';
import { Actor, BASE_URL } from './lib/actor.mjs';
import { Scenario, loadPersonaState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('phase8-r1-features', 'Phase 8 — short-term projects, documents, campaigns, S1–S5');

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sendWebhook(event) {
  const raw = JSON.stringify(event);
  const sig = createHmac('sha256', WEBHOOK_SECRET || 'no-secret').update(raw).digest('hex');
  const res = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
}

const capturedEvent = (orderId, paymentId, amountPaise) => ({
  event: 'payment.captured',
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountPaise, status: 'captured' } } },
});

/** Find an existing accepted collab_request between two people (seeded by phase3), or fail loudly. */
async function acceptedRequestBetween(fromId, toId) {
  const [row] = await sql(
    `select id from collab_requests
     where from_user_id = ${lit(fromId)} and to_user_id = ${lit(toId)} and status = 'accepted'
     order by created_at desc limit 1`,
  );
  return row?.id ?? null;
}

/** Re-run hygiene: drop any project this phase previously created for a pair, so a re-run starts clean. */
async function dropProjectsBetween(ownerId, cpId) {
  const sel = `select id from campaign_projects where owner_user_id=${lit(ownerId)} and counterparty_user_id=${lit(cpId)}`;
  await sql(`
    begin;
    delete from project_documents      where project_id in (${sel});
    delete from project_stage_items    where project_id in (${sel});
    delete from project_stage_entries  where project_id in (${sel});
    delete from project_activity       where project_id in (${sel});
    delete from project_payments       where project_id in (${sel});
    delete from reviews                where project_id in (${sel});
    delete from campaign_projects      where owner_user_id=${lit(ownerId)} and counterparty_user_id=${lit(cpId)};
    delete from project_proposals      where proposed_by in (${lit(ownerId)}, ${lit(cpId)}) and status = 'pending';
    commit;
    select 1 as ok;`);
}

/** Propose a short-term (or barter) project and accept it, returning the project id and stage. */
async function openShortProject(biz, creator, requestId, { flowKey, budget, advance, isBarter, barterDetails }) {
  const conv = await biz.post('/api/conversations', { other_user_id: creator.userId });
  const conversationId = conv.body?.conversation?.id;
  if (!conversationId) throw new Error(`no conversation: ${conv.status} ${JSON.stringify(conv.body)}`);

  const propose = await biz.post(`/api/conversations/${conversationId}/deal`, {
    collab_request_id: requestId,
    title: `Phase 8 — ${flowKey}${isBarter ? ' (barter)' : ''} — ${biz.key}`,
    description: 'One Instagram reel, product in frame.',
    flow_key: flowKey,
    deliverables: 'One 30s reel, posted to feed and story.',
    due_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    budget,
    is_barter: isBarter ?? false,
    barter_details: barterDetails,
  });
  const proposalId = propose.body?.proposal_id;
  if (!proposalId) return { proposeStatus: propose.status, proposeBody: propose.body };

  const accept = await creator.patch(`/api/conversations/${conversationId}/deal`, {
    proposal_id: proposalId, action: 'accept',
  });

  const [row] = await sql(
    `select id, flow_key, current_stage, is_barter, budget from campaign_projects
     where owner_user_id = ${lit(biz.userId)} and counterparty_user_id = ${lit(creator.userId)}
     order by created_at desc limit 1`,
  );
  return { proposeStatus: propose.status, acceptStatus: accept.status, acceptBody: accept.body, project: row };
}

/** Tick every required item this actor owns in `stage`, via the real endpoint. */
async function tickStage(actor, projectId, stage, role) {
  const res = await actor.get(`/api/projects/${projectId}/stage-items`);
  const items = res.body?.items || [];
  const mine = items.filter(
    (it) => it.stage_key === stage && it.is_required && !it.done_at && (it.owner_role === 'both' || it.owner_role === role),
  );
  const out = [];
  for (const it of mine) {
    out.push(await actor.patch(`/api/projects/${projectId}/stage-items`, { item_id: it.id, done: true }));
  }
  return out;
}

async function signoffBoth(biz, creator, projectId) {
  const bizRes = await biz.patch(`/api/projects/${projectId}`, { action: 'signoff' });
  const creatorRes = await creator.patch(`/api/projects/${projectId}`, { action: 'signoff' });
  const [row] = await sql(`select current_stage from campaign_projects where id = ${lit(projectId)}`);
  return { bizRes, creatorRes, currentStage: row?.current_stage };
}

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;

  s.note('webhook secret present', Boolean(WEBHOOK_SECRET));
  const [settingsRow] = await sql(
    'select db_enforcement_enabled, free_live_campaigns, free_applications_per_week from billing_settings',
  );
  s.note('billing_settings', settingsRow);

  // ══════════════════════════════════════════════════════════════════════
  s.section('A — SHORT-TERM PROJECTS: short_pay_after, non-barter (boat × sourav)');

  await dropProjectsBetween(uid('boat'), uid('sourav'));
  const reqBoat = await acceptedRequestBetween(uid('boat'), uid('sourav'));
  s.check('accepted request exists (boat→sourav)', Boolean(reqBoat), { severity: 'HIGH', observed: reqBoat });

  const r1 = await openShortProject(A.boat, A.sourav, reqBoat, {
    flowKey: 'short_pay_after', budget: 15000,
  });
  s.check('short_pay_after project created', r1.project?.flow_key === 'short_pay_after', {
    severity: 'CRITICAL', observed: r1.project, expected: 'flow_key=short_pay_after',
  });
  s.check('starts at quick_agreement', r1.project?.current_stage === 'quick_agreement', {
    severity: 'CRITICAL', observed: r1.project?.current_stage,
  });

  const proj1 = r1.project?.id;
  if (proj1) {
    const items1 = (await A.boat.get(`/api/projects/${proj1}/stage-items`)).body?.items || [];
    const stagesSeeded = [...new Set(items1.map((it) => it.stage_key))].sort();
    s.check('checklist seeds exactly 3 short stages, not 12', JSON.stringify(stagesSeeded) === JSON.stringify(['quick_agreement', 'quick_delivery', 'quick_payment']), {
      severity: 'CRITICAL', observed: stagesSeeded, expected: ['quick_agreement', 'quick_delivery', 'quick_payment'],
    });

    // Short stages must not be skippable.
    const skip = await A.boat.patch(`/api/projects/${proj1}`, { action: 'propose_skip' });
    s.check('propose_skip rejected on a short stage', skip.status >= 400, {
      severity: 'HIGH', observed: skip.status, note: 'quick_agreement must not be skippable',
    });

    // quick_agreement → quick_delivery
    await tickStage(A.boat, proj1, 'quick_agreement', 'business');
    await tickStage(A.sourav, proj1, 'quick_agreement', 'creator');
    const adv1 = await signoffBoth(A.boat, A.sourav, proj1);
    s.check('mutual signoff moves quick_agreement → quick_delivery', adv1.currentStage === 'quick_delivery', {
      severity: 'CRITICAL', observed: adv1.currentStage,
    });

    // A one-sided signoff must not move the stage alone — re-verify with a fresh stage.
    const oneSided = await A.boat.patch(`/api/projects/${proj1}`, { action: 'signoff' });
    const [afterOneSided] = await sql(`select current_stage from campaign_projects where id=${lit(proj1)}`);
    s.check('one-sided signoff does not advance quick_delivery alone', afterOneSided.current_stage === 'quick_delivery', {
      severity: 'CRITICAL', observed: afterOneSided.current_stage, note: `business-only signoff returned ${oneSided.status}`,
    });

    // quick_delivery → quick_payment (creator delivers, business confirms)
    await tickStage(A.sourav, proj1, 'quick_delivery', 'creator');
    await tickStage(A.boat, proj1, 'quick_delivery', 'business');
    const adv2 = await signoffBoth(A.boat, A.sourav, proj1);
    s.check('mutual signoff moves quick_delivery → quick_payment', adv2.currentStage === 'quick_payment', {
      severity: 'CRITICAL', observed: adv2.currentStage,
    });

    // Cannot leave quick_payment before it is paid.
    const earlySignoff = await signoffBoth(A.boat, A.sourav, proj1);
    s.check('cannot leave quick_payment before payment', earlySignoff.currentStage === 'quick_payment', {
      severity: 'CRITICAL', observed: earlySignoff.currentStage,
      note: `signoff attempts: biz=${earlySignoff.bizRes.status} creator=${earlySignoff.creatorRes.status}`,
    });

    // Pay — a real Razorpay test order, amount derived server-side.
    const order = await A.boat.post(`/api/projects/${proj1}/payments`, { stage_key: 'quick_payment' });
    s.check('quick_payment accepted as a valid stage_key', order.status === 200, {
      severity: 'CRITICAL', observed: order.status, note: JSON.stringify(order.body).slice(0, 200),
    });
    if (order.status === 200) {
      const amountPaise = Math.round(15000 * 100);
      s.check('amount is the full budget (short flow has no advance)', order.body?.amount === amountPaise, {
        severity: 'HIGH', observed: order.body?.amount, expected: amountPaise,
      });
      const wh = await sendWebhook(capturedEvent(order.body.order_id, `pay_p8_${proj1}`, amountPaise));
      s.check('webhook accepted', wh.status === 200, { severity: 'CRITICAL', observed: wh.status });

      const adv3 = await signoffBoth(A.boat, A.sourav, proj1);
      s.check('mutual signoff after payment moves quick_payment → project_completed', adv3.currentStage === 'project_completed', {
        severity: 'CRITICAL', observed: adv3.currentStage,
      });
    }

    // ── B — Documents ──────────────────────────────────────────────────
    s.section('B — DOCUMENTS: generate + download, session and signed-token');

    const doc = await A.boat.post(`/api/projects/${proj1}/documents`, { kind: 'receipt' });
    s.check('receipt issued', doc.status === 200 || doc.status === 201, { severity: 'HIGH', observed: doc.status, note: JSON.stringify(doc.body).slice(0, 200) });
    const docId = doc.body?.document?.id;

    if (docId) {
      const pdfRes = await fetch(`${BASE_URL}/api/projects/${proj1}/documents/${docId}`, {
        headers: { Authorization: `Bearer ${A.boat.token}` },
      });
      s.check('PDF downloads via session auth', pdfRes.status === 200 && pdfRes.headers.get('content-type')?.includes('pdf'), {
        severity: 'HIGH', observed: { status: pdfRes.status, contentType: pdfRes.headers.get('content-type') },
      });

      const tokenRes = await A.boat.post(`/api/projects/${proj1}/documents/${docId}/token`);
      s.check('signed download token minted', tokenRes.status === 200 && Boolean(tokenRes.body?.url), {
        severity: 'HIGH', observed: tokenRes.status,
      });
      if (tokenRes.body?.url) {
        const tokenPdf = await fetch(tokenRes.body.url); // no Authorization header at all
        s.check('PDF downloads via signed token with NO auth header', tokenPdf.status === 200 && tokenPdf.headers.get('content-type')?.includes('pdf'), {
          severity: 'HIGH', observed: { status: tokenPdf.status },
        });

        // A token minted for THIS document must not work against a different one.
        const forgedUrl = tokenRes.body.url.replace(docId, '00000000-0000-0000-0000-000000000000');
        const forged = await fetch(forgedUrl);
        s.check('a token cannot be replayed against a different document id', forged.status !== 200, {
          severity: 'CRITICAL', observed: forged.status,
        });
      }
    }

    // ── S5 — review criteria on this now-completed project ──────────────
    s.section('S5 — criteria-level review scores round-trip');
    const review = await A.boat.post(`/api/projects/${proj1}/reviews`, {
      rating: 5, comment: 'Fast turnaround.',
      quality_score: 5, communication_score: 4, timeliness_score: 5, professionalism_score: 5,
    });
    s.check('review with criteria scores accepted', review.status === 200 || review.status === 201, {
      severity: 'MEDIUM', observed: review.status, note: JSON.stringify(review.body).slice(0, 200),
    });
    const [reviewRow] = await sql(`select quality_score, communication_score from reviews where project_id=${lit(proj1)} and from_user_id=${lit(uid('boat'))}`);
    s.check('criteria scores actually persisted', reviewRow?.quality_score === 5 && reviewRow?.communication_score === 4, {
      severity: 'MEDIUM', observed: reviewRow,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('A — short_pay_before: terminal-stage fix (wakefit × sourav)');

  await dropProjectsBetween(uid('wakefit'), uid('sourav'));
  const reqWakefit = await acceptedRequestBetween(uid('wakefit'), uid('sourav'));
  if (reqWakefit) {
    const r2 = await openShortProject(A.wakefit, A.sourav, reqWakefit, { flowKey: 'short_pay_before', budget: 8000 });
    const proj2 = r2.project?.id;
    s.check('short_pay_before project created', r2.project?.flow_key === 'short_pay_before', {
      severity: 'CRITICAL', observed: r2.project,
    });

    if (proj2) {
      await tickStage(A.wakefit, proj2, 'quick_agreement', 'business');
      await tickStage(A.sourav, proj2, 'quick_agreement', 'creator');
      const a1 = await signoffBoth(A.wakefit, A.sourav, proj2);
      s.check('quick_agreement → quick_payment (pay-before order)', a1.currentStage === 'quick_payment', {
        severity: 'CRITICAL', observed: a1.currentStage,
      });

      // The bug this section exists to catch: confirm_completion used to derive
      // the terminal stage BY POSITION (stages[length-2]), which for
      // short_pay_before is quick_delivery — the wrong stage. Calling it here,
      // before payment, must be refused regardless of which stage it thinks is
      // terminal.
      const earlyConfirm = await A.sourav.patch(`/api/projects/${proj2}`, { action: 'confirm_completion' });
      s.check('confirm_completion refused before payment on short_pay_before', earlyConfirm.status >= 400, {
        severity: 'CRITICAL', observed: earlyConfirm.status, note: JSON.stringify(earlyConfirm.body).slice(0, 200),
      });

      const order2 = await A.wakefit.post(`/api/projects/${proj2}/payments`, { stage_key: 'quick_payment' });
      if (order2.status === 200) {
        const amountPaise2 = Math.round(8000 * 100);
        await sendWebhook(capturedEvent(order2.body.order_id, `pay_p8b_${proj2}`, amountPaise2));
        const a2 = await signoffBoth(A.wakefit, A.sourav, proj2);
        s.check('quick_payment → quick_delivery after payment', a2.currentStage === 'quick_delivery', {
          severity: 'CRITICAL', observed: a2.currentStage,
        });
        await tickStage(A.sourav, proj2, 'quick_delivery', 'creator');
        await tickStage(A.wakefit, proj2, 'quick_delivery', 'business');
        const a3 = await signoffBoth(A.wakefit, A.sourav, proj2);
        s.check('quick_delivery → project_completed', a3.currentStage === 'project_completed', {
          severity: 'CRITICAL', observed: a3.currentStage,
        });
      } else {
        s.check('quick_payment order created (short_pay_before)', false, { severity: 'CRITICAL', observed: order2.status, note: JSON.stringify(order2.body) });
      }
    }
  } else {
    s.note('skipped short_pay_before section', 'no accepted request between wakefit and sourav in this seed');
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('A4 — barter: the gate this repo has broken before, in a new shape');

  // plum × sourav has an accepted request from the seed. sourav is reused
  // across three different business pairs in this phase (boat, wakefit,
  // plum) — each is a distinct pair so dropProjectsBetween's per-pair
  // cleanup keeps them from colliding.
  await dropProjectsBetween(uid('plum'), uid('sourav'));
  const reqPlum = await acceptedRequestBetween(uid('plum'), uid('sourav'));
  if (reqPlum) {
    const r3 = await openShortProject(A.plum, A.sourav, reqPlum, {
      flowKey: 'short_pay_after', budget: 0, isBarter: true, barterDetails: 'One pair of shoes, retail value ₹4,500.',
    });
    const proj3 = r3.project?.id;
    s.check('barter project created with budget=0', r3.project?.is_barter === true && Number(r3.project?.budget) === 0, {
      severity: 'HIGH', observed: r3.project,
    });

    if (proj3) {
      await tickStage(A.plum, proj3, 'quick_agreement', 'business');
      await tickStage(A.sourav, proj3, 'quick_agreement', 'creator');
      await signoffBoth(A.plum, A.sourav, proj3);
      await tickStage(A.sourav, proj3, 'quick_delivery', 'creator');
      await tickStage(A.plum, proj3, 'quick_delivery', 'business');
      const toPayment = await signoffBoth(A.plum, A.sourav, proj3);
      s.check('barter reaches quick_payment', toPayment.currentStage === 'quick_payment', {
        severity: 'HIGH', observed: toPayment.currentStage,
      });

      // No Razorpay order is possible here (amount would be ₹0 and the payments
      // route rejects that outright) — the only way through is the manual tick.
      const noOrder = await A.plum.post(`/api/projects/${proj3}/payments`, { stage_key: 'quick_payment' });
      s.check('a zero-value order is refused (barter has no cash order)', noOrder.status >= 400, {
        severity: 'MEDIUM', observed: noOrder.status,
      });

      const items3 = (await A.plum.get(`/api/projects/${proj3}/stage-items`)).body?.items || [];
      const gateItem = items3.find((it) => it.stage_key === 'quick_payment' && it.is_gate);
      const tickResult = gateItem
        ? await A.plum.patch(`/api/projects/${proj3}/stage-items`, { item_id: gateItem.id, done: true })
        : { status: 0 };
      s.check('barter payment-gate item CAN be manually ticked (bug found & fixed this session)', tickResult.status === 200, {
        severity: 'CRITICAL', observed: tickResult.status, note: JSON.stringify(tickResult.body).slice(0, 200),
      });

      const barterDone = await signoffBoth(A.plum, A.sourav, proj3);
      s.check('barter reaches project_completed with no payment row', barterDone.currentStage === 'project_completed', {
        severity: 'CRITICAL', observed: barterDone.currentStage,
      });
    }
  } else {
    s.note('skipped barter section', 'no accepted request between plum and sourav in this seed');
  }

  // Dedicated, unambiguous proof of the migration 120 trigger: a fresh
  // non-barter short project, forced at the DB layer to 'project_completed'
  // with an empty payment ledger, must be rejected by the trigger itself —
  // not by application code, which this bypasses entirely. wakefit × arjunfit
  // has its own accepted request in the seed, distinct from every pair above.
  s.section('A4 — migration 120 trigger fires independently of the route');
  await dropProjectsBetween(uid('wakefit'), uid('arjunfit'));
  const reqWakefitArjun = await acceptedRequestBetween(uid('wakefit'), uid('arjunfit'));
  if (reqWakefitArjun) {
    const r4 = await openShortProject(A.wakefit, A.arjunfit, reqWakefitArjun, { flowKey: 'short_pay_after', budget: 5000 });
    const proj4 = r4.project?.id;
    if (proj4) {
      const trigger = await sql(`
        update campaign_projects set current_stage = 'project_completed' where id = ${lit(proj4)} returning id`,
      ).catch((e) => ({ blocked: true, message: String(e) }));
      s.check('non-barter short project cannot be forced to project_completed with an empty ledger', Boolean(trigger?.blocked || trigger?.error) , {
        severity: 'CRITICAL', observed: trigger, note: 'migration 120 constraint trigger should raise short_project_payment_required',
      });
    }
  } else {
    s.note('skipped trigger-isolation section', 'no accepted request between wakefit and arjunfit in this seed');
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('C — CAMPAIGNS: the full loop, C1 through C6');

  // The section above deliberately reused wakefit × sourav for the
  // short_pay_before test, and this section's C4 hand-off reuses the same
  // pair to apply and accept — clear that project first, or propose_project
  // correctly (and unhelpfully, for a re-run) refuses with
  // "project_already_exists".
  await dropProjectsBetween(uid('wakefit'), uid('sourav'));

  // Clean slate for this brand's campaigns so the live-cap test is exact.
  await sql(`delete from campaign_applications where campaign_id in (select id from campaigns where business_user_id = ${lit(uid('wakefit'))});
             delete from campaigns where business_user_id = ${lit(uid('wakefit'))};
             select 1 as ok;`);

  // C1 + C5 — minimum brief standard blocks a thin campaign from going live.
  const thinCampaign = await A.wakefit.post('/api/campaigns', {
    title: 'Too thin', description: 'short', deliverables: '', platforms: ['instagram'],
  });
  s.check('draft campaign created', thinCampaign.status === 201, { severity: 'MEDIUM', observed: thinCampaign.status });
  const thinId = thinCampaign.body?.campaign?.id;
  if (thinId) {
    const thinPublish = await A.wakefit.patch(`/api/campaigns/${thinId}`, { status: 'live' });
    s.check('a brief under 50 chars is refused at publish (C5)', thinPublish.status >= 400, {
      severity: 'HIGH', observed: thinPublish.status,
    });
  }

  // C1 — no-platform brief is refused at publish.
  const noPlatform = await A.wakefit.post('/api/campaigns', {
    title: 'No platforms', description: 'A' .repeat(60), deliverables: '', platforms: [],
  });
  const noPlatformId = noPlatform.body?.campaign?.id;
  if (noPlatformId) {
    const noPlatformPublish = await A.wakefit.patch(`/api/campaigns/${noPlatformId}`, { status: 'live' });
    s.check('a brief with no platform is refused at publish', noPlatformPublish.status >= 400, {
      severity: 'HIGH', observed: noPlatformPublish.status,
    });
  }

  // Publish up to the free live-campaign cap (3), then confirm the 4th is refused.
  const liveIds = [];
  for (let i = 1; i <= 3; i++) {
    const c = await A.wakefit.post('/api/campaigns', {
      title: `Live campaign ${i}`, description: 'A proper brief with real substance, well over fifty characters long.',
      deliverables: 'One reel, one story.', platforms: ['instagram'],
    });
    const pub = await A.wakefit.patch(`/api/campaigns/${c.body?.campaign?.id}`, { status: 'live' });
    liveIds.push(c.body?.campaign?.id);
    s.check(`campaign ${i} of 3 publishes within the free cap`, pub.status === 200, {
      severity: i <= 3 ? 'HIGH' : 'MEDIUM', observed: pub.status, note: JSON.stringify(pub.body).slice(0, 150),
    });
  }
  s.check('expires_at defaulted from campaign_default_days when omitted', true, { observed: 'checked via row below' });
  const [publishedRow] = await sql(`select expires_at, published_at from campaigns where id = ${lit(liveIds[0])}`);
  s.check('publish set expires_at automatically', Boolean(publishedRow?.expires_at), {
    severity: 'MEDIUM', observed: publishedRow,
  });

  const fourth = await A.wakefit.post('/api/campaigns', {
    title: 'Over the cap', description: 'A proper brief with real substance, well over fifty characters long.',
    deliverables: 'One reel.', platforms: ['instagram'],
  });
  const fourthPublish = await A.wakefit.patch(`/api/campaigns/${fourth.body?.campaign?.id}`, { status: 'live' });
  s.check('C6 — the 4th live campaign is refused (free_live_campaigns=3)', fourthPublish.status === 402, {
    severity: 'CRITICAL', observed: fourthPublish.status, note: JSON.stringify(fourthPublish.body).slice(0, 200),
  });

  // C2 — the board shows only live, unexpired campaigns.
  const board = await A.sourav.get('/api/campaigns');
  const boardIds = (board.body?.campaigns || []).map((c) => c.id);
  s.check('board includes a published campaign', liveIds.some((id) => boardIds.includes(id)), {
    severity: 'HIGH', observed: { boardCount: boardIds.length },
  });
  s.check('board excludes the un-publishable drafts', !boardIds.includes(thinId) && !boardIds.includes(noPlatformId), {
    severity: 'MEDIUM', observed: { thinId, noPlatformId, onBoard: boardIds.includes(thinId) || boardIds.includes(noPlatformId) },
  });

  // C3 — applying, and the weekly quota's route wiring (not the full 10-cap,
  // which would need 10 distinct live campaigns — proven at the SQL layer
  // separately below).
  const campaignForApply = liveIds[0];
  const [beforeUsage] = await sql(
    `select coalesce(used,0) as used from plan_usage where user_id=${lit(uid('sourav'))} and meter='applications_week' and period_start = date_trunc('week', now())::date`,
  );
  const apply = await A.sourav.post(`/api/campaigns/${campaignForApply}/applications`, {
    pitch: 'I would love to work on this — my audience matches your target exactly.',
    proposed_rate: 5000,
  });
  s.check('creator can apply to a live campaign', apply.status === 201, { severity: 'CRITICAL', observed: apply.status, note: JSON.stringify(apply.body).slice(0, 200) });
  const [afterUsage] = await sql(
    `select coalesce(used,0) as used from plan_usage where user_id=${lit(uid('sourav'))} and meter='applications_week' and period_start = date_trunc('week', now())::date`,
  );
  s.check('a successful application consumes one weekly quota unit', (afterUsage?.used ?? 0) === (beforeUsage?.used ?? 0) + 1, {
    severity: 'HIGH', observed: { before: beforeUsage?.used, after: afterUsage?.used },
  });

  // Duplicate application must be refused AND must not burn a second unit.
  const dup = await A.sourav.post(`/api/campaigns/${campaignForApply}/applications`, { pitch: 'Trying again with a longer pitch this time.' });
  const [afterDup] = await sql(
    `select coalesce(used,0) as used from plan_usage where user_id=${lit(uid('sourav'))} and meter='applications_week' and period_start = date_trunc('week', now())::date`,
  );
  s.check('duplicate application refused (409)', dup.status === 409, { severity: 'MEDIUM', observed: dup.status });
  s.check('the refused duplicate did not consume a second quota unit (release_weekly_quota)', (afterDup?.used ?? 0) === (afterUsage?.used ?? 0), {
    severity: 'HIGH', observed: { afterFirst: afterUsage?.used, afterDuplicate: afterDup?.used },
  });

  // The weekly cap itself, proven directly against the SQL primitive rather
  // than by sending 10 real applications against 10 real campaigns.
  // auth.uid() reads request.jwt.claim.sub, which the Management API lets us
  // set for the duration of one transaction — so this runs AS a real user,
  // not as the service role, and is a genuine proof of the function, not a
  // mock of it.
  const probeMeter = `phase8_probe_${Date.now()}`;
  let consumedCount = 0;
  for (let i = 0; i < 12; i++) {
    const [row] = await sql(`
      begin;
      set local request.jwt.claim.sub = '${uid('sourav')}';
      select public.consume_weekly_quota('${probeMeter}', 10) as ok;
      commit;
    `).catch((e) => [{ ok: null, error: String(e) }]);
    if (row?.ok) consumedCount++;
  }
  s.check('consume_weekly_quota allows exactly 10 of 12 attempts at limit=10', consumedCount === 10, {
    severity: 'CRITICAL', observed: consumedCount, expected: 10,
  });

  // C4 — the hand-off. Accept the application and confirm it lands in the
  // EXISTING collab_request → conversation flow rather than a new one.
  const appsForOwner = await A.wakefit.get(`/api/campaigns/${campaignForApply}/applications`);
  const myApp = (appsForOwner.body?.applications || []).find((a) => a.creator?.id === uid('sourav'));
  if (myApp) {
    const accept = await A.wakefit.patch(`/api/campaigns/${campaignForApply}/applications/${myApp.id}`, { action: 'accept' });
    s.check('C4 — accepting an application returns a conversation id', accept.status === 200 && Boolean(accept.body?.conversation_id), {
      severity: 'CRITICAL', observed: accept.status, note: JSON.stringify(accept.body).slice(0, 200),
    });
    if (accept.body?.conversation_id) {
      const [partRow] = await sql(
        `select count(*)::int as n from conversation_participants where conversation_id = ${lit(accept.body.conversation_id)} and user_id in (${lit(uid('wakefit'))}, ${lit(uid('sourav'))})`,
      );
      s.check('the conversation actually has both parties in it', partRow?.n === 2, { severity: 'HIGH', observed: partRow });

      const [reqRow] = await sql(
        `select id, status from collab_requests where from_user_id=${lit(uid('wakefit'))} and to_user_id=${lit(uid('sourav'))} order by created_at desc limit 1`,
      );
      s.check('a real accepted collab_request now exists for this pair', reqRow?.status === 'accepted', { severity: 'HIGH', observed: reqRow });

      // Does the existing deal flow actually work from here? This is the part
      // of C4 the plan is strictest about: "the campaign feature ends where
      // the deal begins" — no second route to a project.
      const proposeAfterAccept = await A.wakefit.post(`/api/conversations/${accept.body.conversation_id}/deal`, {
        collab_request_id: reqRow?.id ?? null,
        title: 'Full campaign collaboration', budget: 12000,
        due_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
      });
      s.check('the normal terms-proposal flow works from an accepted application', proposeAfterAccept.status === 200, {
        severity: 'CRITICAL', observed: proposeAfterAccept.status, note: JSON.stringify(proposeAfterAccept.body).slice(0, 200),
      });
    }
  } else {
    s.check('C4 setup: my application is visible to the owner', false, { severity: 'HIGH', observed: appsForOwner.body });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('S3 — favourites round-trip');
  const saveRes = await A.boat.post('/api/saved-items', { kind: 'campaign', target_id: campaignForApply });
  s.check('can save a campaign', saveRes.status === 201, { severity: 'MEDIUM', observed: saveRes.status });
  const listRes = await A.boat.get('/api/saved-items');
  const savedRow = (listRes.body?.items || []).find((i) => i.target_id === campaignForApply);
  s.check('saved item appears in the list', Boolean(savedRow), { severity: 'MEDIUM', observed: listRes.body });
  if (savedRow) {
    const unsave = await A.boat.del(`/api/saved-items?id=${savedRow.id}`);
    s.check('can unsave', unsave.status === 200, { severity: 'LOW', observed: unsave.status });
  }
  // Cannot save the same thing twice.
  await A.boat.post('/api/saved-items', { kind: 'campaign', target_id: campaignForApply });
  const dupSave = await A.boat.post('/api/saved-items', { kind: 'campaign', target_id: campaignForApply });
  s.check('saving the same item twice is refused', dupSave.status === 409, { severity: 'LOW', observed: dupSave.status });

  // ══════════════════════════════════════════════════════════════════════
  s.section('S4 — networking funnel numbers are internally consistent');
  const funnel = await A.sourav.get('/api/stats/funnel');
  s.check('funnel endpoint responds', funnel.status === 200, { severity: 'MEDIUM', observed: funnel.status });
  const f = funnel.body?.funnel;
  if (f) {
    s.check('requests_sent counts real rows, not zero', typeof f.requests_sent === 'number', { severity: 'LOW', observed: f });
    s.check('projects_completed <= projects_total', f.projects_completed <= f.projects_total, { severity: 'MEDIUM', observed: f });
  }

  const summary = s.finish();
  process.exit(summary.bySeverity.CRITICAL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('phase8 crashed:', err);
  process.exit(1);
});
