// The objectionable-content filter, through the REAL routes (Apple 1.2 / Google UGC).
//
// For every write path the filter guards, offensive text must get a 422 that
// names the field (and never echoes the text), must WRITE NOTHING, and clean
// text must still go through. Chat is intentionally not covered (Stream's job).
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-content-filter.mjs
// Needs the dev server (web-e2e profile) and seed-personas run first.

import { createClient } from '@supabase/supabase-js';
import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-content-filter', 'Objectionable-content filter on every write path');
const BAD = 'you are a fucking chutiya';
const UUID = '00000000-0000-4000-8000-000000000001';

const refused = (r, field) => r.status === 422 && r.body?.reason === 'objectionable_content' && r.body?.field === field
  && /isn't allowed on Influnet/.test(r.body?.error ?? '') && !/fuck|chutiya/i.test(JSON.stringify(r.body));

async function main() {
  const boat = new Actor(personaByKey('boat'));
  const sourav = new Actor(personaByKey('sourav'));
  const masoom = new Actor(personaByKey('masoom'));
  for (const a of [boat, sourav, masoom]) await a.signIn();

  await sql(`delete from campaigns where title like 'E2E filter %'`);

  s.section('Profile');
  const bioBefore = (await sql(`select bio from influencer_profiles where user_id=${lit(sourav.userId)}`))[0]?.bio;
  const pBad = await sourav.patch('/api/profile', { bio: BAD });
  s.check('bio with abuse → 422 naming "bio", text not echoed', refused(pBad, 'bio'),
    { severity: 'CRITICAL', observed: `${pBad.status} ${JSON.stringify(pBad.body).slice(0, 200)}` });
  s.check('…and the bio was NOT changed', (await sql(`select bio from influencer_profiles where user_id=${lit(sourav.userId)}`))[0]?.bio === bioBefore,
    { severity: 'CRITICAL' });
  const nBad = await sourav.patch('/api/profile', { name: 'Priya f*ck' });
  s.check('a name with a starred word → 422 naming "name"', refused(nBad, 'name'),
    { severity: 'HIGH', observed: `${nBad.status} ${JSON.stringify(nBad.body).slice(0, 200)}` });
  const pOk = await sourav.patch('/api/profile', { bio: bioBefore || 'Food and travel creator.' });
  s.check('a clean bio still saves (200)', pOk.status === 200, { severity: 'HIGH', observed: `${pOk.status} ${JSON.stringify(pOk.body).slice(0, 160)}` });
  const bizBad = await boat.patch('/api/profile', { company_description: BAD });
  s.check('a business company_description with abuse → 422 naming "company description"', refused(bizBad, 'company_description'),
    { severity: 'HIGH', observed: `${bizBad.status} ${JSON.stringify(bizBad.body).slice(0, 200)}` });

  s.section('Signup');
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const email = `filter.check.${Date.now().toString(36)}@influnet-audit.test`;
  const su = await c.auth.signUp({ email, password: 'Passw0rd!filter' });
  const reg = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/api/auth/register`, {
    method: 'POST', headers: { Authorization: `Bearer ${su.data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'business_owner', name: 'Filter Check', companyName: 'shit fuck madarchod', businessType: 'private_limited', industry: 'Beauty', registeredAddress: '1 Road, Pune', marketingBudget: '1L-5L', termsAccepted: true, ageConfirmed: true }),
  });
  const regBody = await reg.json().catch(() => ({}));
  s.check('signup with an abusive company name → 422 naming "company name"', reg.status === 422 && regBody.field === 'companyName' && regBody.reason === 'objectionable_content',
    { severity: 'CRITICAL', observed: `${reg.status} ${JSON.stringify(regBody).slice(0, 200)}` });
  s.check('…and no profile was created', (await sql(`select 1 from profiles where id=${lit(su.data.user.id)}`)).length === 0, { severity: 'CRITICAL' });
  await sql(`delete from auth.users where id=${lit(su.data.user.id)}`);

  s.section('Campaigns');
  const cBad = await boat.post('/api/campaigns', { title: 'E2E filter campaign', description: BAD, deliverables: 'One reel.', platforms: ['instagram'] });
  s.check('campaign description with abuse → 422 naming "description"', refused(cBad, 'description'),
    { severity: 'CRITICAL', observed: `${cBad.status} ${JSON.stringify(cBad.body).slice(0, 200)}` });
  s.check('…and no campaign row was written', (await sql(`select 1 from campaigns where title='E2E filter campaign'`)).length === 0, { severity: 'CRITICAL' });
  const cOk = await boat.post('/api/campaigns', { title: 'E2E filter ok', description: 'A proper brief with real substance, well over fifty characters long.', deliverables: 'One reel.', platforms: ['instagram'] });
  s.check('a clean campaign still creates (200/201)', cOk.status === 200 || cOk.status === 201, { severity: 'HIGH', observed: `${cOk.status} ${JSON.stringify(cOk.body).slice(0, 160)}` });
  const cid = cOk.body?.campaign?.id;
  const cEdit = await boat.patch(`/api/campaigns/${cid}`, { deliverables: BAD });
  s.check('editing a campaign into abuse → 422 naming "deliverables"', refused(cEdit, 'deliverables'),
    { severity: 'CRITICAL', observed: `${cEdit.status} ${JSON.stringify(cEdit.body).slice(0, 200)}` });
  s.check('…and the stored deliverables are unchanged', (await sql(`select deliverables from campaigns where id=${lit(cid)}`))[0]?.deliverables === 'One reel.', { severity: 'CRITICAL' });

  s.section('Collaboration requests');
  await sql(`delete from collab_requests where status='pending' and from_user_id=${lit(boat.userId)} and to_user_id=${lit(sourav.userId)}`);
  const rBad = await boat.post('/api/collabs', { to_user_id: sourav.userId, project_title: 'Launch', project_description: BAD, budget: 1000 });
  s.check('request description with abuse → 422 naming "project description"', refused(rBad, 'project_description'),
    { severity: 'CRITICAL', observed: `${rBad.status} ${JSON.stringify(rBad.body).slice(0, 200)}` });
  s.check('…and no request row was written', (await sql(`select 1 from collab_requests where from_user_id=${lit(boat.userId)} and to_user_id=${lit(sourav.userId)} and status='pending'`)).length === 0, { severity: 'CRITICAL' });
  const peerBad = await sourav.post('/api/collabs/peer', { to_user_id: masoom.userId, message: BAD });
  s.check('a creator-to-creator message with abuse → 422 naming "message"', refused(peerBad, 'message'),
    { severity: 'CRITICAL', observed: `${peerBad.status} ${JSON.stringify(peerBad.body).slice(0, 200)}` });

  s.section('Project terms');
  const dealBad = await boat.post(`/api/conversations/${UUID}/deal`, { collab_request_id: UUID, title: 'Launch', description: BAD, budget: 1000, flow_key: 'full' });
  s.check('proposed terms with abuse → 422 naming "description"', refused(dealBad, 'description'),
    { severity: 'CRITICAL', observed: `${dealBad.status} ${JSON.stringify(dealBad.body).slice(0, 200)}` });
  const crBad = await boat.post('/api/projects/999999999/change-requests', { changes: { deliverables: BAD } });
  s.check('a change request with abuse → 422 naming "deliverables"', refused(crBad, 'deliverables'),
    { severity: 'CRITICAL', observed: `${crBad.status} ${JSON.stringify(crBad.body).slice(0, 200)}` });

  s.section('Not over-blocking');
  const okTxt = 'Launching the Scunthorpe & Essex range: 3 reels, ₹50,000 budget, class of 2026 — assassin-grade quality!';
  const okReq = await boat.post('/api/collabs', { to_user_id: sourav.userId, project_title: 'Range launch', project_description: okTxt, budget: 50000 });
  s.check('an ordinary brief with tricky-looking words is accepted', okReq.status === 200 || okReq.status === 201,
    { severity: 'HIGH', observed: `${okReq.status} ${JSON.stringify(okReq.body).slice(0, 200)}` });

  await sql(`delete from campaigns where title like 'E2E filter %'`);
  await sql(`delete from collab_requests where status='pending' and from_user_id=${lit(boat.userId)} and to_user_id=${lit(sourav.userId)}`);
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
