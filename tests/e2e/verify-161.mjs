// Verify migration 161 + the deletion flow end-to-end (Task 1 / F2 / acc-delete).
//
// The bug (GO_LIVE_AUDIT_2026-09-17 F2): campaign_projects.owner_user_id and
// counterparty_user_id were ON DELETE CASCADE (006). When either person deleted
// their account, auth.admin.deleteUser() cascaded the shared project — and with
// it project_payments (059) and project_documents (124) — away for BOTH sides.
// Tax law and the draft terms require the money record to outlive a leaver.
//
// What this script proves, through the REAL HTTP API only (no direct deletes
// except re-seed hygiene):
//   1. A brand + creator complete a full 12-stage project with a real
//      advance + final payment (signed Razorpay test webhooks).
//   2. The CREATOR deletes their account via DELETE /api/profile — the
//      self-service path — after the active-project guard passes.
//   3. The brand still opens the project (GET /api/projects/[id]), still sees
//      its payment ledger (GET /api/projects/[id]/payments), still generates
//      and downloads a tax invoice (POST + GET on /documents), and the
//      surviving party renders as "Deleted account" everywhere.
//   4. The other direction: the deleted creator's rows are gone; the brand's
//      are untouched. DB-level: counterparty_user_id is NULL, the ledger and
//      documents rows survive with the project.
//   5. Re-seed: the personas are purged and re-created so later phases run
//      clean (state/personas.json is regenerated).
//
// Usage:
//   node --env-file=apps/web/.env.local tests/e2e/verify-161.mjs
// Requires the dev server running under the web-e2e profile
// (NOTIFY_EMAILS_ENABLED=false, BROADCAST_DRY_RUN=true) and Razorpay TEST keys.

import { Actor } from './lib/actor.mjs';
import { Scenario, loadState, saveState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';
import { openProject, passStage, currentStage } from './lib/lifecycle.mjs';
import { createHmac } from 'node:crypto';

const s = new Scenario('verify-161', 'Migration 161 — deletion cannot destroy the other party\'s records');
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

async function sendWebhook(event) {
  const raw = JSON.stringify(event);
  const sig = createHmac('sha256', WEBHOOK_SECRET || 'no-secret').update(raw).digest('hex');
  const res = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const brand = new Actor(personaByKey('boat'));
  const creator = new Actor(personaByKey('sourav'));
  await brand.signIn();
  await creator.signIn();

  // ── A completed, PAID project with an invoice ───────────────────────────
  s.section('Setup: complete a paid project between boAt and Sourav');

  // Re-run hygiene: drop this pair's earlier projects so proposal/limit state
  // is fresh (mirror of phase5's own hygiene).
  const pairSel = `select id from campaign_projects where owner_user_id=${lit(brand.userId)} and counterparty_user_id=${lit(creator.userId)}`;
  await sql(`
    begin;
    delete from project_documents where project_id in (${pairSel});
    delete from project_stage_items where project_id in (${pairSel});
    delete from project_stage_entries where project_id in (${pairSel});
    delete from project_activity where project_id in (${pairSel});
    delete from project_payments where project_id in (${pairSel});
    delete from reviews where project_id in (${pairSel});
    delete from campaign_projects where owner_user_id=${lit(brand.userId)} and counterparty_user_id=${lit(creator.userId)};
    delete from project_proposals where proposed_by in (${lit(brand.userId)}, ${lit(creator.userId)});
    commit;
    select 1 as ok;`);

  // An accepted collab_request between this pair (phase3 makes one; recreate
  // directly if state was wiped).
  let req = await sql(
    `select id from collab_requests
     where from_user_id=${lit(brand.userId)} and to_user_id=${lit(creator.userId)} and status='accepted'
     order by created_at desc limit 1`);
  if (!req.length) {
    // Read POST /api/collabs and PATCH /api/collabs before changing this: the
    // body is { to_user_id, project_title, project_description, budget } and the
    // accept is PATCH /api/collabs { id, status:'accepted' } (see phase3).
    await sql(`delete from collab_requests where from_user_id=${lit(brand.userId)} and to_user_id=${lit(creator.userId)} and status='pending'`);
    const sent = await brand.post('/api/collabs', {
      to_user_id: creator.userId,
      project_title: 'Deletion-survival fixture (161)',
      project_description: 'Paid-project fixture for the deletion test.',
      budget: 200000,
    });
    s.note('collab request', `${sent.status} ${JSON.stringify(sent.body).slice(0, 120)}`);
    const pending = await sql(
      `select id from collab_requests where from_user_id=${lit(brand.userId)} and to_user_id=${lit(creator.userId)} and status='pending' order by created_at desc limit 1`);
    if (pending.length) {
      const acc = await creator.patch('/api/collabs', { id: pending[0].id, status: 'accepted' });
      s.note('collab accept', `${acc.status}`);
    }
    req = await sql(
      `select id from collab_requests
       where from_user_id=${lit(brand.userId)} and to_user_id=${lit(creator.userId)} and status='accepted'
       order by created_at desc limit 1`);
  }
  if (!req.length) {
    s.check('an accepted collab_request exists to open a project from', false,
      { severity: 'CRITICAL', observed: 'none — open one via phase3 first', expected: 'a row' });
    s.finish();
    return;
  }

  const opened = await openProject(brand, creator, {
    requestId: req[0].id,
    title: 'Deletion-survival fixture (161)',
    budget: 200000, advance: 100000,
  });
  const projectId = opened.projectId;
  s.check('the project opened', Boolean(projectId),
    { severity: 'CRITICAL', observed: opened.acceptStatus + ' ' + JSON.stringify(opened.acceptBody).slice(0, 200), expected: 'a project id' });

  if (!projectId) { s.finish(); return; }

  await brand.get(`/api/projects/${projectId}/stage-items`);

  // Pay both gates with real signed webhooks, then walk every stage.
  async function payStage(stage) {
    const already = await sql(
      `select count(*)::int as n from project_payments where project_id=${lit(projectId)} and stage_key=${lit(stage)} and status='paid'`);
    if (already[0].n > 0) return;
    const o = await brand.post(`/api/projects/${projectId}/payments`, { stage_key: stage });
    const oid = o.body?.order?.id ?? o.body?.order_id;
    const amt = o.body?.order?.amount ?? o.body?.amount;
    if (!oid) {
      s.check(`could create a ${stage} order`, false,
        { severity: 'HIGH', observed: `${o.status} ${JSON.stringify(o.body).slice(0, 200)}` });
      return;
    }
    const wh = await sendWebhook({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_161_${stage}`, order_id: oid, amount: amt, status: 'captured' } } } });
    s.note(`  paid ${stage}`, `order ${oid} → webhook ${wh.status}`);
  }

  let guard = 0;
  let stage = (await currentStage(projectId)).current_stage;
  while (stage !== 'project_completed' && guard++ < 20) {
    if (stage === 'advance_payment' || stage === 'final_payment') await payStage(stage);
    const step = await passStage(projectId, brand, creator);
    s.note(`  ${step.from} → ${step.to}`, step.moved ? `via ${step.how}` : 'STUCK');
    if (!step.moved) break;
    stage = step.to;
  }
  s.check('the fixture project reached project_completed', stage === 'project_completed',
    { severity: 'CRITICAL', observed: stage, expected: 'project_completed' });

  const paid = await sql(
    `select count(*)::int as n, coalesce(sum(amount),0)::bigint as total from project_payments where project_id=${lit(projectId)} and status='paid'`);
  s.check('the fixture has confirmed payments in the ledger', paid[0].n > 0,
    { severity: 'CRITICAL', observed: `${paid[0].n} paid rows, ₹${paid[0].total / 100}`, expected: '> 0' });

  // Issue the tax invoice BEFORE deletion so the document row exists the way
  // it would in real life, and the survivor only needs to DOWNLOAD it.
  const inv = await creator.post(`/api/projects/${projectId}/documents`, { kind: 'tax_invoice' });
  s.check('the creator issued a tax invoice before deleting',
    inv.ok && Boolean(inv.body?.document?.id),
    { severity: 'CRITICAL', observed: `${inv.status} ${JSON.stringify(inv.body).slice(0, 200)}` });
  const invoiceNumber = inv.body?.document?.number ?? null;

  // ── The creator deletes their account (self-service path) ───────────────
  s.section('The creator deletes their account via DELETE /api/profile');

  const del = await creator.del('/api/profile', { reason_code: 'privacy' });
  s.check('self-service deletion succeeded (guard passed, tombstone written, auth user gone)',
    del.status === 200,
    { severity: 'CRITICAL', observed: `${del.status} ${JSON.stringify(del.body).slice(0, 200)}`, expected: 200 });

  // ── The brand's side of the world survives ──────────────────────────────
  s.section('The brand keeps everything');

  const dbProj = await sql(
    `select owner_user_id, counterparty_user_id, status, current_stage from campaign_projects where id=${lit(projectId)}`);
  s.check('the project row survives deletion', dbProj.length === 1,
    { severity: 'CRITICAL', observed: dbProj, expected: '1 row' });
  s.check('the deleted party\'s FK is nulled, not cascaded',
    dbProj[0]?.counterparty_user_id === null && dbProj[0]?.owner_user_id === brand.userId,
    { severity: 'CRITICAL', observed: { owner: dbProj[0]?.owner_user_id, counterparty: dbProj[0]?.counterparty_user_id },
      expected: 'owner intact, counterparty NULL' });

  const dbPaid = await sql(
    `select count(*)::int as n from project_payments where project_id=${lit(projectId)} and status='paid'`);
  s.check('the payment ledger survives deletion', dbPaid[0]?.n === paid[0].n && paid[0].n > 0,
    { severity: 'CRITICAL', observed: dbPaid[0]?.n, expected: paid[0].n });

  const dbDoc = await sql(
    `select id, number from project_documents where project_id=${lit(projectId)} and kind='tax_invoice'`);
  s.check('the issued tax invoice survives deletion', dbDoc.length === 1 && dbDoc[0].number === invoiceNumber,
    { severity: 'CRITICAL', observed: dbDoc, expected: `number ${invoiceNumber}` });

  const got = await brand.get(`/api/projects/${projectId}`);
  s.check('the surviving party can still open the project',
    got.ok && (got.body?.project?.id === projectId || got.body?.id === projectId),
    { severity: 'CRITICAL', observed: `${got.status} ${JSON.stringify(got.body).slice(0, 200)}`, expected: 200 });

  const otherName = JSON.stringify(got.body ?? {});
  s.check('the deleted party renders as "Deleted account" for the survivor',
    otherName.includes('Deleted account'),
    { severity: 'HIGH', observed: otherName.slice(0, 300), expected: 'contains "Deleted account"' });

  // The ledger has no list API: the apps read project_payments straight from
  // Supabase as the caller, so the survivor's RLS view IS the product path.
  // (GET /api/projects/[id]/payments only returns the checkout config.)
  const ledRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/project_payments?project_id=eq.${projectId}&status=eq.paid&select=id,amount,stage_key`,
    { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${brand.token}` } });
  const ledRows = ledRes.ok ? await ledRes.json() : [];
  s.check('the surviving party can still read the payment ledger (through RLS, as the apps do)',
    ledRes.ok && ledRows.length === paid[0].n && paid[0].n > 0,
    { severity: 'CRITICAL', observed: `${ledRes.status} ${JSON.stringify(ledRows).slice(0, 200)}`, expected: `${paid[0].n} paid rows` });

  const docs = await brand.get(`/api/projects/${projectId}/documents`);
  s.check('the surviving party can still list the documents',
    docs.ok && (docs.body?.documents?.length ?? 0) >= 1,
    { severity: 'CRITICAL', observed: `${docs.status} ${JSON.stringify(docs.body).slice(0, 200)}`, expected: '≥ 1' });

  // Generate a fresh invoice as the SURVIVOR — this is the "tax law needs it"
  // path: post-deletion, the brand must still be able to produce documents.
  const inv2 = await brand.post(`/api/projects/${projectId}/documents`, { kind: 'receipt' });
  s.check('the survivor can still issue a document post-deletion',
    inv2.ok || inv2.body?.document?.id || inv2.status === 200,
    { severity: 'HIGH', observed: `${inv2.status} ${JSON.stringify(inv2.body).slice(0, 200)}`, expected: 200 });

  if (inv2.body?.document?.file_url) {
    const file = await fetch(inv2.body.document.file_url.startsWith('http')
      ? inv2.body.document.file_url
      : `${process.env.E2E_BASE_URL || 'http://localhost:3000'}${inv2.body.document.file_url}`);
    s.check('the document PDF is actually downloadable post-deletion',
      file.status === 200,
      { severity: 'HIGH', observed: `${file.status} ${(file.headers.get('content-type') || '')}`, expected: 200 });
  }

  // With nobody on the other side, nothing can be signed off, paid or changed.
  const frozen = await brand.patch(`/api/projects/${projectId}`, { action: 'request_cancellation', reason_category: 'other', reason_text: 'x' });
  s.check('acting on a project whose other party is gone is refused with a clear 409',
    frozen.status === 409 && /deleted their account/i.test(JSON.stringify(frozen.body)),
    { severity: 'HIGH', observed: `${frozen.status} ${JSON.stringify(frozen.body).slice(0, 200)}`, expected: '409 read-only record' });
  s.check('GET /api/projects/[id] names the deleted party in other_party',
    got.body?.other_party?.deleted === true && got.body?.other_party?.name === 'Deleted account',
    { severity: 'HIGH', observed: JSON.stringify(got.body?.other_party), expected: '{deleted:true,name:"Deleted account"}' });

  // The deleted creator's own session must be dead.
  const ghost = await creator.get('/api/profile');
  s.check('the deleted creator\'s token no longer works',
    ghost.status === 401 || ghost.status === 403,
    { severity: 'MEDIUM', observed: ghost.status, expected: '401/403' });

  // A stranger must NOT be able to reach it (participation predicate still
  // holds with a NULL FK).
  const stranger = new Actor(personaByKey('sugar'));
  await stranger.signIn();
  const sneak = await stranger.get(`/api/projects/${projectId}`);
  s.check('a non-participant still cannot open the project with a NULL participant',
    sneak.status === 403 || sneak.status === 404,
    { severity: 'CRITICAL', observed: sneak.status, expected: '403/404' });

  // ── Re-seed so later phases run clean ───────────────────────────────────
  s.section('Re-seed: restore the audit personas');
  const { spawnSync } = await import('node:child_process');
  const reseed = spawnSync('node', ['--env-file=apps/web/.env.local', 'tests/e2e/seed-personas.mjs'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const reseedOk = reseed.status === 0 && /12\/12|12 of 12|personas/i.test(`${reseed.stdout}`);
  s.note('re-seed exit', `${reseed.status}${reseed.stdout ? ' — ' + reseed.stdout.split('\n').filter(Boolean).slice(-2).join(' | ') : ''}`);
  s.check('personas re-seeded cleanly after the deletion test', reseedOk,
    { severity: 'HIGH', observed: `exit ${reseed.status}`, expected: 'exit 0' });
  if (reseed.stderr) saveState('verify-161-reseed-stderr', { stderr: reseed.stderr.slice(0, 2000) });

  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
