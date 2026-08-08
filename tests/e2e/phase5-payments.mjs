// Phase 6/7 — payments, the checklist-gate bypass probe, and completion.
//
// Payments run against Razorpay TEST keys (rzp_test_...). No real money moves.
// Capture is simulated by posting a correctly HMAC-signed webhook — the same
// bytes Razorpay would send — so the whole ledger → gate → stage path is
// exercised for real rather than stubbed.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phase5-payments.mjs

import { createHmac } from 'node:crypto';
import { Actor, raceAll, BASE_URL } from './lib/actor.mjs';
import { Scenario, loadPersonaState, saveState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { openProject, passStage, currentStage, tickChecklist } from './lib/lifecycle.mjs';

const s = new Scenario('phase5-payments', 'Phase 6/7 — payments, gate bypass & completion');

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

/** Post a webhook event signed exactly the way Razorpay signs one. */
async function sendWebhook(event, { secret = WEBHOOK_SECRET, corrupt = false } = {}) {
  const raw = JSON.stringify(event);
  let sig = createHmac('sha256', secret || 'no-secret').update(raw).digest('hex');
  if (corrupt) sig = sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
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

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const uid = (k) => A[k].userId;

  s.note('Razorpay webhook secret present', Boolean(WEBHOOK_SECRET));

  // Re-run hygiene: this phase opens fresh projects for the boAt and SUGAR
  // pairs, and propose_project refuses a second project on a collaboration that
  // already has one ("project_already_exists"). Drop only those two pairs'
  // projects — the Phase 4 project is reused deliberately and must survive.
  const pairs = [[uid('boat'), uid('sourav')], [uid('sugar'), uid('sourav')]];
  for (const [owner, cp] of pairs) {
    const sel = `select id from campaign_projects where owner_user_id=${lit(owner)} and counterparty_user_id=${lit(cp)}`;
    await sql(`
      begin;
      delete from project_stage_items where project_id in (${sel});
      delete from project_stage_entries where project_id in (${sel});
      delete from project_activity where project_id in (${sel});
      delete from project_payments where project_id in (${sel});
      delete from reviews where project_id in (${sel});
      delete from campaign_projects where owner_user_id=${lit(owner)} and counterparty_user_id=${lit(cp)};
      delete from project_proposals where proposed_by in (${lit(owner)}, ${lit(cp)});
      commit;
      select 1 as ok;`);
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('CHECKLIST GATE BYPASS — is the gate vacuous before first render?');

  // project_stage_items rows are seeded LAZILY, by GET /stage-items. The
  // advance/sign-off gate calls blockingItems() over whatever rows exist — so
  // on a project whose checklist has never been fetched there are no required
  // items and the gate has nothing to block on. A client that never opens the
  // checklist (or a direct API caller) would then walk straight through the
  // payment gates without paying.
  const bypassReq = await sql(
    `select id from collab_requests
     where from_user_id = ${lit(uid('boat'))} and to_user_id = ${lit(uid('sourav'))} and status='accepted' limit 1`);

  let bypassProject = null;
  if (bypassReq.length) {
    const opened = await openProject(A.boat, A.sourav, {
      requestId: bypassReq[0].id, title: 'boAt × Sourav — gate bypass probe',
      budget: 800000, advance: 300000,
    });
    bypassProject = opened.projectId;
    s.check('project created for the bypass probe', Boolean(bypassProject),
      { severity: 'HIGH', observed: `${opened.acceptStatus} ${JSON.stringify(opened.acceptBody).slice(0, 200)}` });
  }

  if (bypassProject) {
    const seeded = await sql(
      `select count(*)::int as n from project_stage_items where project_id = ${lit(bypassProject)}`);
    s.note('checklist rows on a brand-new project (before any GET)', seeded[0].n);
    s.check('a new project has its checklist materialised at creation',
      seeded[0].n > 0,
      { severity: 'HIGH', observed: `${seeded[0].n} rows`, expected: '> 0',
        note: 'Seeded lazily by GET /stage-items instead. Until something fetches the ' +
              'checklist there are no required items, so the advance/sign-off gate has ' +
              'nothing to block on.' });

    // Drive it straight at the money gate without ever fetching the checklist.
    await sql(`update campaign_projects set current_stage='advance_payment',
               stage_progress='{}'::jsonb where id=${lit(bypassProject)}`);
    const bizSign = await A.boat.patch(`/api/projects/${bypassProject}`, { action: 'signoff' });
    const creSign = await A.sourav.patch(`/api/projects/${bypassProject}`, { action: 'signoff' });
    const afterBypass = await currentStage(bypassProject);

    const paid = await sql(
      `select count(*)::int as n from project_payments
       where project_id = ${lit(bypassProject)} and status='paid'`);

    s.check('advance_payment cannot be passed without a recorded payment',
      !(afterBypass.current_stage === 'content_planning' && paid[0].n === 0),
      { severity: 'CRITICAL',
        observed: `stage=${afterBypass.current_stage}, paid rows=${paid[0].n}, signoff=[${bizSign.status},${creSign.status}]`,
        expected: 'stage stays at advance_payment while no payment exists',
        note: 'If this fails, a caller who never GETs the checklist walks through the ' +
              'money gate: the ledger stays empty and the creator is told the advance ' +
              'was received.' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Payment authorization & amount integrity');

  // Use the Phase 4 project, driven to advance_payment.
  const lifeState = JSON.parse(
    (await import('node:fs')).readFileSync(
      new URL('./state/phase4-project.json', import.meta.url), 'utf8'));
  const projectId = lifeState.projectId;
  await sql(`update campaign_projects set current_stage='advance_payment', status='active',
             stage_progress='{}'::jsonb where id=${lit(projectId)}`);
  await A.mamaearth.get(`/api/projects/${projectId}/stage-items`); // materialise checklist

  const cfg = await A.mamaearth.get(`/api/projects/${projectId}/payments`);
  s.note('payments configured', JSON.stringify(cfg.body).slice(0, 150));

  // Only the payer may create an order.
  const creatorOrder = await A.sourav.post(`/api/projects/${projectId}/payments`, { stage_key: 'advance_payment' });
  s.check('creator cannot initiate a payment order',
    creatorOrder.status === 403,
    { severity: 'HIGH', observed: `${creatorOrder.status} ${JSON.stringify(creatorOrder.body).slice(0, 150)}`,
      expected: 403 });

  const strangerOrder = await A.wakefit.post(`/api/projects/${projectId}/payments`, { stage_key: 'advance_payment' });
  s.check('a non-participant business cannot initiate a payment order',
    strangerOrder.status === 403 || strangerOrder.status === 404,
    { severity: 'CRITICAL', observed: strangerOrder.status, expected: '403/404' });

  // Amount tampering: the agreed advance is ₹200,000.
  const tamper = await A.mamaearth.post(`/api/projects/${projectId}/payments`,
    { stage_key: 'advance_payment', amount_rupees: 1 });
  s.check('a client-supplied amount that disagrees with the terms is rejected',
    tamper.status >= 400,
    { severity: 'CRITICAL', observed: `${tamper.status} ${JSON.stringify(tamper.body).slice(0, 200)}`,
      expected: '4xx — paying ₹1 must not open a ₹200,000 gate' });

  const order = await A.mamaearth.post(`/api/projects/${projectId}/payments`, { stage_key: 'advance_payment' });
  s.check('the payer can create an advance-payment order',
    order.status === 200 && Boolean(order.body?.order?.id ?? order.body?.order_id),
    { severity: 'HIGH', observed: `${order.status} ${JSON.stringify(order.body).slice(0, 250)}` });

  const orderId = order.body?.order?.id ?? order.body?.order_id;
  const orderAmount = order.body?.order?.amount ?? order.body?.amount;
  s.check('the order amount comes from the agreed terms, not the client',
    Number(orderAmount) === 200000 * 100,
    { severity: 'CRITICAL', observed: `${orderAmount} paise`, expected: `${200000 * 100} paise (₹200,000 advance)` });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Webhook integrity');

  if (orderId) {
    const unsigned = await fetch(`${BASE_URL}/api/payments/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capturedEvent(orderId, 'pay_forged', 20000000)),
    });
    s.check('an UNSIGNED webhook is rejected', unsigned.status === 401,
      { severity: 'CRITICAL', observed: unsigned.status, expected: 401 });

    const badSig = await sendWebhook(capturedEvent(orderId, 'pay_forged', 20000000), { corrupt: true });
    s.check('a webhook with a corrupted signature is rejected', badSig.status === 401,
      { severity: 'CRITICAL', observed: `${badSig.status} ${badSig.body.slice(0, 120)}`, expected: 401 });

    const wrongSecret = await sendWebhook(capturedEvent(orderId, 'pay_forged', 20000000), { secret: 'attacker-secret' });
    s.check('a webhook signed with the wrong secret is rejected', wrongSecret.status === 401,
      { severity: 'CRITICAL', observed: wrongSecret.status, expected: 401 });

    const stillUnpaid = await sql(
      `select status from project_payments where razorpay_order_id = ${lit(orderId)}`);
    s.check('no forged webhook marked the ledger paid',
      stillUnpaid.every((r) => r.status !== 'paid'),
      { severity: 'CRITICAL', observed: stillUnpaid, expected: 'nothing paid' });

    // The genuine article.
    const good = await sendWebhook(capturedEvent(orderId, 'pay_audit_advance', 200000 * 100));
    s.check('a correctly signed capture webhook is accepted',
      good.status === 200,
      { severity: 'HIGH', observed: `${good.status} ${good.body.slice(0, 200)}` });

    const ledger = await sql(
      `select status, amount, stage_key from project_payments where razorpay_order_id = ${lit(orderId)}`);
    s.check('the ledger row is marked paid', ledger[0]?.status === 'paid',
      { severity: 'HIGH', observed: ledger, expected: "status='paid'" });

    // Replay the same event — must be idempotent.
    const replay = await sendWebhook(capturedEvent(orderId, 'pay_audit_advance', 200000 * 100));
    const ledgerAfter = await sql(
      `select count(*)::int as n from project_payments where razorpay_order_id = ${lit(orderId)} and status='paid'`);
    s.check('replaying a captured webhook does not double-record',
      ledgerAfter[0].n === 1,
      { severity: 'HIGH', observed: `${ledgerAfter[0].n} paid rows, replay status ${replay.status}`, expected: '1' });

    // The gate item must now be tickable.
    const gateTick = await tickChecklist(A.mamaearth, projectId, 'advance_payment', 'business');
    s.check('the payment gate item opens once the payment is confirmed',
      gateTick.every((t) => t.status === 200),
      { severity: 'HIGH', observed: gateTick, expected: 'all ticks accepted' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Full 12-stage walk WITH payments');

  await sql(`update campaign_projects set current_stage='collaboration_started',
             stage_progress='{}'::jsonb where id=${lit(projectId)}`);

  const walk = [];
  let stage = 'collaboration_started';
  let guard = 0;
  while (stage !== 'project_completed' && guard++ < 20) {
    if (stage === 'advance_payment' || stage === 'final_payment') {
      const already = await sql(
        `select count(*)::int as n from project_payments
         where project_id=${lit(projectId)} and stage_key=${lit(stage)} and status='paid'`);
      if (already[0].n === 0) {
        const o = await A.mamaearth.post(`/api/projects/${projectId}/payments`, { stage_key: stage });
        const oid = o.body?.order?.id ?? o.body?.order_id;
        const amt = o.body?.order?.amount ?? o.body?.amount;
        if (oid) {
          const wh = await sendWebhook(capturedEvent(oid, `pay_audit_${stage}`, amt));
          s.note(`  paid ${stage}`, `order ${oid} → webhook ${wh.status}`);
        } else {
          s.check(`could create a ${stage} order`, false,
            { severity: 'HIGH', observed: `${o.status} ${JSON.stringify(o.body).slice(0, 200)}` });
          break;
        }
      }
    }
    const step = await passStage(projectId, A.mamaearth, A.sourav);
    walk.push({ from: step.from, to: step.to, how: step.how, moved: step.moved });
    s.note(`  ${step.from} → ${step.to}`, step.moved ? `via ${step.how}` : 'STUCK');
    if (!step.moved) {
      const detail = step.responses.filter((r) => r.res)
        .map((r) => `${r.who}: ${r.res.status} ${JSON.stringify(r.res.body).slice(0, 200)}`);
      s.check(`stage "${step.from}" can be completed`, false,
        { severity: 'HIGH', observed: detail, expected: 'advances' });
      break;
    }
    stage = step.to;
  }

  const reached = walk.length ? walk[walk.length - 1].to : stage;
  s.check('a project can be driven end-to-end to project_completed (paying for real)',
    reached === 'project_completed',
    { severity: 'CRITICAL', observed: `reached ${reached} after ${walk.length} steps`,
      expected: 'project_completed' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Completion & reviews');

  const finalRow = await currentStage(projectId);
  s.note('final project state', { stage: finalRow?.current_stage, status: finalRow?.status });

  if (reached === 'project_completed') {
    const done = await sql(`select status from campaign_projects where id=${lit(projectId)}`);
    s.check('a bilaterally confirmed project reaches a completed status',
      done[0]?.status === 'completed',
      { severity: 'HIGH', observed: done, expected: "status='completed'" });

    const rev1 = await A.mamaearth.post(`/api/projects/${projectId}/reviews`, { rating: 5, comment: 'Superb work.' });
    const rev2 = await A.sourav.post(`/api/projects/${projectId}/reviews`, { rating: 4, comment: 'Great brand to work with.' });
    s.check('both sides can leave a review on a completed project',
      rev1.ok && rev2.ok,
      { severity: 'MEDIUM', observed: `business ${rev1.status} ${JSON.stringify(rev1.body).slice(0, 120)} | creator ${rev2.status} ${JSON.stringify(rev2.body).slice(0, 120)}` });

    const dupRev = await A.mamaearth.post(`/api/projects/${projectId}/reviews`, { rating: 1, comment: 'Changed my mind.' });
    s.check('a second review from the same party is refused',
      dupRev.status >= 400,
      { severity: 'MEDIUM', observed: `${dupRev.status} ${JSON.stringify(dupRev.body).slice(0, 150)}`, expected: '4xx' });

    const strangerRev = await A.wakefit.post(`/api/projects/${projectId}/reviews`, { rating: 1, comment: 'I was never here.' });
    s.check('a non-participant cannot review the project',
      strangerRev.status === 403 || strangerRev.status === 404,
      { severity: 'CRITICAL', observed: `${strangerRev.status} ${JSON.stringify(strangerRev.body).slice(0, 150)}`,
        expected: '403/404' });

    const outOfRange = await A.sourav.post(`/api/projects/${projectId}/reviews`, { rating: 99, comment: 'Out of range.' });
    s.check('an out-of-range rating is rejected', outOfRange.status === 400,
      { severity: 'LOW', observed: outOfRange.status, expected: 400 });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Cancellation & the payment ledger');

  const cancelReq = await sql(
    `select id from collab_requests
     where from_user_id = ${lit(uid('sugar'))} and to_user_id = ${lit(uid('sourav'))} and status='accepted' limit 1`);
  if (cancelReq.length) {
    const opened = await openProject(A.sugar, A.sourav, {
      requestId: cancelReq[0].id, title: 'SUGAR × Sourav — cancellation probe',
      budget: 300000, advance: 100000,
    });
    const cp = opened.projectId;
    if (cp) {
      await A.sugar.get(`/api/projects/${cp}/stage-items`);
      await sql(`update campaign_projects set current_stage='advance_payment' where id=${lit(cp)}`);
      const o = await A.sugar.post(`/api/projects/${cp}/payments`, { stage_key: 'advance_payment' });
      const oid = o.body?.order?.id ?? o.body?.order_id;
      if (oid) await sendWebhook(capturedEvent(oid, 'pay_audit_cancel', o.body?.order?.amount ?? o.body?.amount));

      const paidBefore = await sql(
        `select count(*)::int as n from project_payments where project_id=${lit(cp)} and status='paid'`);

      const reqCancel = await A.sugar.patch(`/api/projects/${cp}`,
        { action: 'request_cancellation', reason_category: 'budget_changed', note: 'Budget pulled.' });
      s.note('request_cancellation →', `${reqCancel.status} ${JSON.stringify(reqCancel.body).slice(0, 150)}`);

      const unilateral = await sql(`select status from campaign_projects where id=${lit(cp)}`);
      s.check('one side alone cannot cancel a project outright',
        unilateral[0]?.status !== 'cancelled',
        { severity: 'HIGH', observed: unilateral, expected: 'not yet cancelled — needs the other side' });

      const accCancel = await A.sourav.patch(`/api/projects/${cp}`, { action: 'accept_cancellation' });
      s.note('accept_cancellation →', `${accCancel.status} ${JSON.stringify(accCancel.body).slice(0, 150)}`);

      const paidAfter = await sql(
        `select count(*)::int as n from project_payments where project_id=${lit(cp)} and status='paid'`);
      s.check('cancelling preserves the payment ledger',
        paidAfter[0].n === paidBefore[0].n && paidBefore[0].n > 0,
        { severity: 'CRITICAL', observed: `before=${paidBefore[0].n} after=${paidAfter[0].n}`,
          expected: 'ledger rows survive cancellation',
          note: 'A cancelled project that erases its payment history destroys the only ' +
                'record that money changed hands.' });

      const postCancelAdvance = await A.sugar.patch(`/api/projects/${cp}`, { action: 'advance' });
      s.check('a cancelled project cannot be advanced',
        postCancelAdvance.status === 409,
        { severity: 'HIGH', observed: `${postCancelAdvance.status} ${JSON.stringify(postCancelAdvance.body).slice(0, 150)}`,
          expected: 409 });

      const postCancelPay = await A.sugar.post(`/api/projects/${cp}/payments`, { stage_key: 'final_payment' });
      s.check('a cancelled project cannot take further payments',
        postCancelPay.status === 409,
        { severity: 'CRITICAL', observed: `${postCancelPay.status} ${JSON.stringify(postCancelPay.body).slice(0, 150)}`,
          expected: 409 });
    }
  }

  saveState('phase5-summary', { projectId, walk, reached });
  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
