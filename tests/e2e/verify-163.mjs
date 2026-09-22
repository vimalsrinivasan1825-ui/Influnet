// Reports carry WHERE they were made (migration 163 + POST /api/reports).
//
//   • A report from a profile / campaign / request is stored with its context.
//   • The context ids must really belong to the person being reported: another
//     brand's campaign, or a request between two other people, is refused.
//   • A bad context value, and reporting yourself, are refused.
//   • Blocking still hides the person (the other half of "report or block").
//   • The admin queue's embed (`campaign:campaigns!user_reports_campaign_id_fkey`)
//     resolves, i.e. a moderator sees which campaign a report is about.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-163.mjs
// Needs the dev server (web-e2e profile) and seed-personas run first.

import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-163', 'Reports carry their context (profile / campaign / request)');

async function main() {
  const boat = new Actor(personaByKey('boat'));       // the brand being reported
  const wakefit = new Actor(personaByKey('wakefit')); // an unrelated brand
  const sourav = new Actor(personaByKey('sourav'));   // the reporter (creator)
  const masoom = new Actor(personaByKey('masoom'));   // an unrelated creator
  for (const a of [boat, wakefit, sourav, masoom]) await a.signIn();

  await sql(`delete from user_reports where reporter_id = ${lit(sourav.userId)}`);
  await sql(`delete from campaigns where title like 'E2E report ctx %'`);
  // Fixture hygiene by PAIR (collab_requests has no title column): only pending
  // rows between the two pairs this test uses.
  const pairs = `(from_user_id=${lit(boat.userId)} and to_user_id=${lit(sourav.userId)}) or (from_user_id=${lit(wakefit.userId)} and to_user_id=${lit(masoom.userId)})`;
  await sql(`delete from collab_requests where status='pending' and (${pairs})`);

  const mk = async (who, title) => {
    const c = await who.post('/api/campaigns', {
      title, description: 'A proper brief with real substance, well over fifty characters long.',
      deliverables: 'One reel, one story.', platforms: ['instagram'],
    });
    const id = c.body?.campaign?.id;
    if (id) await who.patch(`/api/campaigns/${id}`, { status: 'live' });
    return id;
  };
  const boatCampaign = await mk(boat, 'E2E report ctx boat');
  const otherCampaign = await mk(wakefit, 'E2E report ctx wakefit');
  s.check('fixtures: two live campaigns from two different brands', Boolean(boatCampaign && otherCampaign),
    { severity: 'CRITICAL', observed: { boatCampaign, otherCampaign } });

  const sendReq = async (from, to, title) => {
    await from.post('/api/collabs', { to_user_id: to.userId, project_title: title, project_description: 'fixture', budget: 100000 });
    return (await sql(`select id from collab_requests where from_user_id=${lit(from.userId)} and to_user_id=${lit(to.userId)} and status='pending' order by created_at desc limit 1`))[0]?.id;
  };
  const boatReq = await sendReq(boat, sourav, 'E2E report ctx boat→sourav');
  const otherReq = await sendReq(wakefit, masoom, 'E2E report ctx wakefit→masoom');
  s.check('fixtures: a request between boat and sourav, and one between two other people', Boolean(boatReq && otherReq),
    { severity: 'CRITICAL', observed: { boatReq, otherReq } });

  s.section('Reports keep their context');
  const rProfile = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'spam', context: 'profile' });
  s.check('a report from a profile is accepted', rProfile.ok, { severity: 'HIGH', observed: `${rProfile.status} ${JSON.stringify(rProfile.body)}` });
  const rCamp = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'scam', context: 'campaign', campaign_id: boatCampaign });
  s.check('a report from a campaign is accepted', rCamp.ok, { severity: 'HIGH', observed: `${rCamp.status} ${JSON.stringify(rCamp.body)}` });
  const rReq = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'harassment', context: 'request', collab_request_id: boatReq });
  s.check('a report from a request is accepted', rReq.ok, { severity: 'HIGH', observed: `${rReq.status} ${JSON.stringify(rReq.body)}` });

  const rows = await sql(`select context, campaign_id, collab_request_id, status from user_reports where reporter_id=${lit(sourav.userId)} order by created_at`);
  s.check('all three are stored open, with their context and ids',
    rows.length === 3 && rows[0].context === 'profile' && rows[1].context === 'campaign' && rows[1].campaign_id === boatCampaign
      && rows[2].context === 'request' && rows[2].collab_request_id === boatReq && rows.every((r) => r.status === 'open'),
    { severity: 'HIGH', observed: rows });

  s.section('Context must belong to the reported person');
  const wrongCamp = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'scam', context: 'campaign', campaign_id: otherCampaign });
  s.check("another brand's campaign cannot be pinned to a report about boat (400)", wrongCamp.status === 400,
    { severity: 'HIGH', observed: `${wrongCamp.status} ${JSON.stringify(wrongCamp.body)}`, expected: 400 });
  const wrongReq = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'scam', context: 'request', collab_request_id: otherReq });
  s.check('a request between two OTHER people cannot be pinned to the report (400)', wrongReq.status === 400,
    { severity: 'HIGH', observed: `${wrongReq.status} ${JSON.stringify(wrongReq.body)}`, expected: 400 });
  const badCtx = await sourav.post('/api/reports', { reported_id: boat.userId, reason: 'spam', context: 'nonsense' });
  s.check('an unknown context value is refused (400)', badCtx.status === 400, { severity: 'MEDIUM', observed: badCtx.status });
  const self = await sourav.post('/api/reports', { reported_id: sourav.userId, reason: 'spam', context: 'profile' });
  s.check('reporting yourself is still refused (400)', self.status === 400, { severity: 'MEDIUM', observed: self.status });

  s.section('Blocking from the same places');
  const blk = await sourav.post('/api/blocks', { blocked_id: boat.userId });
  s.check('blocking the brand succeeds', blk.ok, { severity: 'HIGH', observed: `${blk.status} ${JSON.stringify(blk.body)}` });
  const list = await sourav.get('/api/blocks');
  s.check('the block shows in the blocked list ({blocks})', (list.body?.blocks ?? []).some((b) => b.blocked_id === boat.userId),
    { severity: 'HIGH', observed: JSON.stringify(list.body).slice(0, 160) });
  const req = await boat.post('/api/collabs', { to_user_id: sourav.userId, project_title: 'E2E report ctx blocked', project_description: 'x', budget: 1000 });
  s.check('a blocked brand can no longer send that creator a request', req.status === 403 || req.status === 400 || req.status === 404,
    { severity: 'HIGH', observed: `${req.status} ${JSON.stringify(req.body).slice(0, 140)}`, expected: '4xx' });
  await sourav.del('/api/blocks', { blocked_id: boat.userId });

  s.section('The admin queue can show the context');
  const fk = await sql(`select conname from pg_constraint where conrelid='public.user_reports'::regclass and conname='user_reports_campaign_id_fkey'`);
  s.check('the FK the admin embed names exists (user_reports_campaign_id_fkey)', fk.length === 1,
    { severity: 'HIGH', observed: fk, note: 'apps/web/src/app/api/admin/reports/route.ts embeds campaign:campaigns!user_reports_campaign_id_fkey' });

  await sql(`delete from user_reports where reporter_id = ${lit(sourav.userId)}`);
  await sql(`delete from campaigns where title like 'E2E report ctx %'`);
  await sql(`delete from collab_requests where status='pending' and (${pairs})`);
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
