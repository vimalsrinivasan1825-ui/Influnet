// Business approval is enforced by the DATABASE, so calling PostgREST directly
// (with the user's own JWT and the public anon key that every client holds) can no
// longer skip the API's rules. Migration 164; unit acc-bsignup.
//
// Before 164 this script's first two checks FAILED: a business still awaiting
// review published a LIVE campaign with one POST to /rest/v1/campaigns, and a
// REJECTED business sent a request with one POST to /rest/v1/collab_requests.
//
//   • Direct PostgREST: pending cannot create/publish a campaign; rejected cannot send.
//   • The product rule is unchanged: a business awaiting review CAN still send a request.
//   • Through the API: publishing a draft as a non-approved business is a clear 403.
//   • An approved business still creates and publishes as before.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-164.mjs
// Needs the dev server (web-e2e profile) and seed-personas run first. The pending
// persona (bewakoof) is restored to its original status in `finally`.

import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-164', 'Business approval is enforced in the database (direct PostgREST cannot bypass it)');
const REST = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;

async function main() {
  const bew = new Actor(personaByKey('bewakoof')); // left in pending_review by the seeder
  const boat = new Actor(personaByKey('boat'));    // approved
  const sourav = new Actor(personaByKey('sourav'));
  for (const a of [bew, boat, sourav]) await a.signIn();

  const status = async (a) => (await sql(`select approval_status from business_profiles where user_id=${lit(a.userId)}`))[0]?.approval_status;
  const originalBew = await status(bew);
  const direct = (a, table, row) => fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${a.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  }).then(async (r) => ({ status: r.status, text: await r.text() }));
  const clean = async () => {
    await sql(`delete from campaigns where title like 'E2E 164 %'`);
    await sql(`delete from collab_requests where message like 'E2E 164 %'`);
  };
  await clean();

  try {
    s.check('fixture: bewakoof is awaiting review', originalBew === 'pending_review', { severity: 'CRITICAL', observed: originalBew });

    s.section('Direct PostgREST, skipping the API');
    const brief = { description: 'A proper brief with real substance, well over fifty characters long.', deliverables: 'One reel.', platforms: ['instagram'] };
    const live = await direct(bew, 'campaigns', { business_user_id: bew.userId, title: 'E2E 164 direct live', status: 'live', ...brief });
    s.check('a pending business cannot publish a LIVE campaign straight through PostgREST', live.status === 403 && /business_not_approved/.test(live.text),
      { severity: 'CRITICAL', observed: `${live.status} ${live.text.slice(0, 140)}`, expected: '403 business_not_approved' });
    const draft = await direct(bew, 'campaigns', { business_user_id: bew.userId, title: 'E2E 164 direct draft', status: 'draft', ...brief });
    s.check('…nor create a draft (the API refuses that too)', draft.status === 403, { severity: 'HIGH', observed: `${draft.status} ${draft.text.slice(0, 120)}` });
    s.check('…and no campaign row exists', (await sql(`select 1 from campaigns where title like 'E2E 164 direct%'`)).length === 0, { severity: 'CRITICAL' });

    await sql(`update business_profiles set approval_status='rejected' where user_id=${lit(bew.userId)}`);
    const rej = await direct(bew, 'collab_requests', { from_user_id: bew.userId, to_user_id: sourav.userId, message: 'E2E 164 rejected direct', budget: 1000 });
    s.check('a REJECTED business cannot send a request straight through PostgREST', rej.status === 403 && /business_not_approved/.test(rej.text),
      { severity: 'CRITICAL', observed: `${rej.status} ${rej.text.slice(0, 140)}`, expected: '403 business_not_approved' });
    s.check('…and no request row exists', (await sql(`select 1 from collab_requests where message='E2E 164 rejected direct'`)).length === 0, { severity: 'CRITICAL' });

    s.section('The product rule is unchanged');
    await sql(`update business_profiles set approval_status='pending_review' where user_id=${lit(bew.userId)}`);
    const pendingSend = await direct(bew, 'collab_requests', { from_user_id: bew.userId, to_user_id: sourav.userId, message: 'E2E 164 pending ok', budget: 1000 });
    s.check('a business awaiting review CAN still send a request (creators see an "unverified" flag)', pendingSend.status === 201,
      { severity: 'CRITICAL', observed: `${pendingSend.status} ${pendingSend.text.slice(0, 140)}`, expected: 201 });

    s.section('Through the API');
    const apiCreate = await bew.post('/api/campaigns', { title: 'E2E 164 api', ...brief });
    s.check('creating a campaign as a pending business is still a clear 403', apiCreate.status === 403, { severity: 'HIGH', observed: `${apiCreate.status} ${JSON.stringify(apiCreate.body).slice(0, 140)}` });
    // An approved business creates a draft; approval is then withdrawn; publishing must be refused CLEARLY.
    const made = await boat.post('/api/campaigns', { title: 'E2E 164 boat draft', ...brief });
    const cid = made.body?.campaign?.id;
    s.check('an approved business still creates a campaign (200/201)', (made.status === 200 || made.status === 201) && Boolean(cid), { severity: 'CRITICAL', observed: `${made.status} ${JSON.stringify(made.body).slice(0, 140)}` });
    await sql(`update business_profiles set approval_status='pending_review' where user_id=${lit(boat.userId)}`);
    const pubNo = await boat.patch(`/api/campaigns/${cid}`, { status: 'live' });
    s.check('publishing a draft once approval is withdrawn → 403 with a clear message (this path had no check)',
      pubNo.status === 403 && /must be approved/.test(JSON.stringify(pubNo.body)),
      { severity: 'CRITICAL', observed: `${pubNo.status} ${JSON.stringify(pubNo.body).slice(0, 160)}`, expected: '403 must be approved' });
    await sql(`update business_profiles set approval_status='approved' where user_id=${lit(boat.userId)}`);
    const pubYes = await boat.patch(`/api/campaigns/${cid}`, { status: 'live' });
    s.check('…and once approved again it publishes (200)', pubYes.status === 200, { severity: 'CRITICAL', observed: `${pubYes.status} ${JSON.stringify(pubYes.body).slice(0, 140)}` });
  } finally {
    await sql(`update business_profiles set approval_status=${lit(originalBew ?? 'pending_review')} where user_id=${lit(bew.userId)}`);
    await sql(`update business_profiles set approval_status='approved' where user_id=${lit(boat.userId)}`);
    await clean();
  }
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
