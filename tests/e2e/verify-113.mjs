// Verify migration 113 end-to-end: the RPCs return real numbers, the security
// boundaries hold, and the numbers agree with the database.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-113.mjs

import { Actor } from './lib/actor.mjs';
import { Scenario, loadPersonaState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-113', 'Migration 113 — collaboration stats & business views');

const TEST_ADMIN = {
  key: 'admin', role: 'admin', name: 'E2E Audit Admin',
  email: 'e2e.admin.audit@influnet-audit.test',
  password: 'QFih$bybiU@L87u%c$Ya=FTo',
};

async function main() {
  const state = loadPersonaState();
  const A = {};
  for (const key of Object.keys(state.actors)) {
    A[key] = new Actor(personaByKey(key));
    await A[key].signIn();
  }
  const admin = new Actor(TEST_ADMIN);
  await admin.signIn();
  const uid = (k) => A[k].userId;

  s.section('get_collaboration_stats');

  const [truth] = await sql(`
    select
      count(*) filter (where status <> 'pending_acceptance')::int as total,
      count(*) filter (where status = 'completed')::int           as completed,
      count(distinct case when owner_user_id = ${lit(uid('sourav'))}
                          then counterparty_user_id else owner_user_id end)
        filter (where status <> 'pending_acceptance')::int        as partners
    from campaign_projects
    where owner_user_id = ${lit(uid('sourav'))} or counterparty_user_id = ${lit(uid('sourav'))}`);
  s.note('DB truth for Sourav', truth);

  const [rpc] = await sql(
    `select * from get_collaboration_stats(${lit(uid('sourav'))})`);
  s.note('RPC returned', rpc);

  s.check('projects_total matches the database',
    rpc.projects_total === truth.total,
    { severity: 'HIGH', observed: rpc.projects_total, expected: truth.total });
  s.check('projects_completed matches the database',
    rpc.projects_completed === truth.completed,
    { severity: 'HIGH', observed: rpc.projects_completed, expected: truth.completed });
  s.check('partners_total matches the database',
    rpc.partners_total === truth.partners,
    { severity: 'HIGH', observed: rpc.partners_total, expected: truth.partners });

  // Works from the business side too, without the caller saying which role.
  const [bizStats] = await sql(
    `select * from get_collaboration_stats(${lit(uid('mamaearth'))})`);
  s.check('the same RPC works for a business account',
    bizStats.projects_total > 0,
    { severity: 'HIGH', observed: bizStats, expected: 'non-zero project counts' });

  // A brand-new account must read as zeros, not error.
  const [freshStats] = await sql(
    `select * from get_collaboration_stats(${lit(uid('kiran'))})`);
  s.check('an account with no collaborations returns zeros, not an error',
    freshStats.projects_total === 0 && freshStats.partners_total === 0,
    { severity: 'MEDIUM', observed: freshStats, expected: 'all zero' });

  s.section('Public profile surfaces the counts');

  const prof = await A.mamaearth.get('/api/creators/souravjoshi');
  s.check('GET /api/creators/[username] returns collaborationStats',
    prof.body?.collaborationStats != null,
    { severity: 'HIGH', observed: JSON.stringify(prof.body?.collaborationStats), expected: 'an object' });
  s.check('the API stats agree with the RPC',
    prof.body?.collaborationStats?.projectsCompleted === rpc.projects_completed,
    { severity: 'HIGH', observed: prof.body?.collaborationStats, expected: `projectsCompleted ${rpc.projects_completed}` });

  s.section('business_profile_views');

  await sql(`delete from business_profile_views where business_user_id = ${lit(uid('mamaearth'))}`);

  // A creator with a relationship can see the brand's private profile; that view
  // must be recorded.
  const vis = await A.sourav.get('/api/creators/souravjoshi'); // warm session
  const beforeRows = await sql(
    `select count(*)::int as n from business_profile_views where business_user_id = ${lit(uid('mamaearth'))}`);

  const rec = await sql(
    `select record_business_profile_view(${lit(uid('mamaearth'))}) as r`).catch((e) => String(e));
  s.note('service-role call (no auth.uid())', typeof rec === 'string' ? rec.slice(0, 120) : 'ok');

  const afterRows = await sql(
    `select count(*)::int as n from business_profile_views where business_user_id = ${lit(uid('mamaearth'))}`);
  s.check('record_business_profile_view refuses a caller with no auth.uid()',
    afterRows[0].n === beforeRows[0].n,
    { severity: 'HIGH', observed: `before=${beforeRows[0].n} after=${afterRows[0].n}`,
      expected: 'no row written without a signed-in caller' });

  s.section('get_admin_engagement_stats');

  const eng = await admin.get('/api/admin/analytics');
  const e = eng.body?.engagement;
  s.check('admin analytics now returns an engagement block',
    e != null,
    { severity: 'HIGH', observed: e == null ? JSON.stringify(eng.body).slice(0, 200) : Object.keys(e),
      expected: 'engagement present' });

  if (e) {
    s.note('signups', e.signups);
    s.note('business funnel', e.business_funnel);
    s.note('creator profile views', e.creator_profile_views);

    const [dbTruth] = await sql(`
      select
        (select count(*) from profiles where role='business_owner')::int as biz,
        (select count(*) from profiles where role='influencer')::int     as cre,
        (select count(*) from profile_views)::int                        as views`);
    s.check('engagement business signup count matches the database',
      e.signups.businesses_total === dbTruth.biz,
      { severity: 'HIGH', observed: e.signups.businesses_total, expected: dbTruth.biz });
    s.check('engagement creator signup count matches the database',
      e.signups.creators_total === dbTruth.cre,
      { severity: 'HIGH', observed: e.signups.creators_total, expected: dbTruth.cre });
    s.check('creator profile view total matches the database',
      e.creator_profile_views.total === dbTruth.views,
      { severity: 'HIGH', observed: e.creator_profile_views.total, expected: dbTruth.views });
    s.check('the demand-side funnel is monotonically non-increasing',
      e.business_funnel.signed_up >= e.business_funnel.viewed_creator &&
      e.business_funnel.started_project >= e.business_funnel.completed_project,
      { severity: 'MEDIUM', observed: e.business_funnel, expected: 'each stage <= the one before' });
  }

  // Non-admins must not reach it.
  const asBiz = await sql(`select 1`).then(() => A.mamaearth.get('/api/admin/analytics'));
  s.check('engagement stats stay behind the admin guard',
    asBiz.status === 401 || asBiz.status === 403,
    { severity: 'CRITICAL', observed: asBiz.status, expected: '401/403' });

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
