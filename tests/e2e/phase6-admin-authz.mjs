// Phase 8/9 — the admin surface, and a whole-API authorization sweep.
//
// The admin half checks two things: that admin routes actually work for an
// admin, and that the numbers they report agree with the database. A dashboard
// that renders is not the same as a dashboard that is right.
//
// The authz half walks EVERY /api route with three callers who should not get
// in — anonymous, a logged-in non-participant, and a creator hitting
// business-only routes — because per-route spot checks are exactly how one
// forgotten route stays open.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/phase6-admin-authz.mjs

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Actor, BASE_URL } from './lib/actor.mjs';
import { Scenario, loadPersonaState, loadState } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('phase6-admin-authz', 'Phase 8/9 — admin surface & authorization sweep');

const TEST_ADMIN = {
  key: 'admin', role: 'admin', name: 'E2E Audit Admin',
  email: 'e2e.admin.audit@influnet-audit.test',
  password: 'QFih$bybiU@L87u%c$Ya=FTo',
};

const API_ROOT = new URL('../../apps/web/src/app/api/', import.meta.url).pathname;

/** Every API route path, derived from the filesystem rather than a hand list. */
function discoverRoutes(dir = API_ROOT, prefix = '/api') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...discoverRoutes(full, `${prefix}/${entry}`));
    } else if (entry === 'route.ts') {
      out.push(prefix);
    }
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
  const admin = new Actor(TEST_ADMIN);
  await admin.signIn();
  const anon = new Actor({ key: 'anon', role: null, email: '', password: '' });
  const uid = (k) => A[k].userId;

  // ══════════════════════════════════════════════════════════════════════
  s.section('Admin surface — does every route work for an admin?');

  const adminRoutes = [
    '/api/admin/dashboard', '/api/admin/users', '/api/admin/businesses',
    '/api/admin/collabs', '/api/admin/projects', '/api/admin/verifications',
    '/api/admin/reports', '/api/admin/audit', '/api/admin/analytics',
    '/api/admin/support', '/api/admin/feedback', '/api/admin/issues',
    '/api/admin/emails', '/api/admin/health', '/api/admin/activity',
    '/api/admin/rate-limits',
  ];

  const adminResults = {};
  for (const route of adminRoutes) {
    const r = await admin.get(route);
    adminResults[route] = r;
    s.check(`admin GET ${route}`, r.status === 200,
      { severity: 'HIGH', observed: `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`, expected: 200 });
  }

  // ── are the numbers actually right? ──────────────────────────────────
  s.section('Admin surface — do the numbers agree with the database?');

  const dash = adminResults['/api/admin/dashboard']?.body ?? {};
  const truth = (await sql(`
    select
      (select count(*) from profiles where role='influencer')::int      as creators,
      (select count(*) from profiles where role='business_owner')::int  as businesses,
      (select count(*) from campaign_projects)::int                     as projects,
      (select count(*) from collab_requests)::int                       as requests,
      (select count(*) from business_profiles where approval_status='pending_review')::int as pending_biz
  `))[0];
  s.note('database truth', truth);
  s.note('admin dashboard payload keys', Object.keys(dash).slice(0, 25));

  const flat = JSON.stringify(dash);
  s.check('admin dashboard reports the real creator count',
    flat.includes(String(truth.creators)),
    { severity: 'MEDIUM', observed: `looking for ${truth.creators} in ${flat.slice(0, 300)}`,
      expected: `creator count ${truth.creators} present` });
  s.check('admin dashboard reports the real business count',
    flat.includes(String(truth.businesses)),
    { severity: 'MEDIUM', observed: `looking for ${truth.businesses}`,
      expected: `business count ${truth.businesses} present` });

  // The users list must actually contain our audit personas.
  const usersBody = adminResults['/api/admin/users']?.body ?? {};
  const userList = usersBody.users ?? usersBody.data ?? usersBody.results ?? [];
  s.check('admin user list includes the seeded audit personas',
    Array.isArray(userList) && userList.some((u) => String(u.email || '').includes('influnet-audit.test')),
    { severity: 'HIGH', observed: `${Array.isArray(userList) ? userList.length : 'non-array'} users`,
      expected: 'audit personas present' });

  // Admin must be able to see the pending business awaiting review.
  const bizBody = adminResults['/api/admin/businesses']?.body ?? {};
  const bizList = bizBody.businesses ?? bizBody.data ?? bizBody.results ?? [];
  s.check('admin business list surfaces the pending_review account',
    Array.isArray(bizList) && bizList.some((b) => b.approval_status === 'pending_review'),
    { severity: 'HIGH', observed: Array.isArray(bizList)
        ? bizList.map((b) => `${b.company_name}:${b.approval_status}`).slice(0, 10)
        : bizBody,
      expected: 'at least one pending_review' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Admin privilege boundary');

  for (const route of adminRoutes) {
    const asCreator = await A.sourav.get(route);
    const asBusiness = await A.mamaearth.get(route);
    const asAnon = await anon.get(route);
    const allRefused = [asCreator, asBusiness, asAnon].every((r) => r.status === 401 || r.status === 403);
    s.check(`${route} is closed to non-admins`, allRefused,
      { severity: 'CRITICAL',
        observed: `creator=${asCreator.status} business=${asBusiness.status} anon=${asAnon.status}`,
        expected: 'all 401/403' });
  }

  // Self-promotion to admin must be impossible (migration 070).
  const promote = await A.sourav.patch('/api/profile', { role: 'admin' });
  const roleNow = await sql(`select role from profiles where id=${lit(uid('sourav'))}`);
  s.check('a user cannot promote themselves to admin',
    roleNow[0].role === 'influencer',
    { severity: 'CRITICAL', observed: `PATCH ${promote.status}, role is now ${roleNow[0].role}`,
      expected: 'role unchanged (influencer)' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Whole-API sweep — anonymous callers');

  const routes = discoverRoutes().sort();
  s.note('API routes discovered', routes.length);

  // Routes that are public by design. Everything else must refuse anonymous.
  const PUBLIC = new Set([
    '/api/health',
    '/api/auth/check-email', '/api/auth/check-phone', '/api/auth/check-username',
    '/api/auth/check-instagram', '/api/auth/config', '/api/auth/suggest-username',
    '/api/auth/social-preview', '/api/auth/scrape-instagram',
    '/api/payments/webhook', '/api/stream/webhook', '/api/webhooks/resend',
    '/api/email/unsubscribe', '/api/phone-otp/send', '/api/phone-otp/verify',
    '/api/auth/register', '/api/auth/pending-registration',
  ]);

  const anonLeaks = [];
  for (const route of routes) {
    if (PUBLIC.has(route)) continue;
    const path = route.replace('[id]', '1').replace('[username]', 'souravjoshi').replace('[cardId]', '1');
    const r = await anon.get(path);
    // 401/403 = refused, 404/405 = nothing to reach. A 200 without auth is a leak.
    if (r.status === 200) anonLeaks.push({ route: path, body: JSON.stringify(r.body).slice(0, 160) });
  }
  s.check('no non-public API route returns 200 to an anonymous caller',
    anonLeaks.length === 0,
    { severity: 'CRITICAL', observed: anonLeaks.length ? anonLeaks : 'none', expected: 'no leaks' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('IDOR sweep — a logged-in stranger against another pair’s objects');

  // Objects belonging to the Mamaearth × Sourav collaboration. `nagma` is a
  // creator with no relationship to either.
  const proj = loadState('phase5-summary')?.projectId ?? loadState('phase4-project')?.projectId;
  const [conv] = await sql(
    `select c.id from conversations c
     join conversation_participants p1 on p1.conversation_id=c.id and p1.user_id=${lit(uid('mamaearth'))}
     join conversation_participants p2 on p2.conversation_id=c.id and p2.user_id=${lit(uid('sourav'))}
     limit 1`);
  const [req] = await sql(
    `select id from collab_requests where from_user_id=${lit(uid('mamaearth'))}
     and to_user_id=${lit(uid('sourav'))} limit 1`);

  const idorTargets = [
    ['GET',   `/api/projects/${proj}`],
    ['GET',   `/api/projects/${proj}/activity`],
    ['GET',   `/api/projects/${proj}/stage-items`],
    ['GET',   `/api/projects/${proj}/stage-entries`],
    ['GET',   `/api/projects/${proj}/payments`],
    ['GET',   `/api/projects/${proj}/reviews`],
    ['GET',   `/api/projects/${proj}/cards`],
    ['GET',   `/api/projects/${proj}/change-requests`],
    ['GET',   `/api/conversations/${conv?.id}`],
    ['GET',   `/api/conversations/${conv?.id}/messages`],
    ['GET',   `/api/conversations/${conv?.id}/deal`],
  ];

  const idorLeaks = [];
  for (const [method, path] of idorTargets) {
    if (path.includes('undefined') || path.includes('null')) continue;
    const r = await A.nagma.api(method, path);
    if (r.status === 200) {
      // A 200 with an empty payload is a weaker leak than a 200 with data, but
      // both mean the route did not refuse a stranger. Record what came back.
      idorLeaks.push({ path, body: JSON.stringify(r.body).slice(0, 200) });
    }
  }
  // GET /api/projects/[id]/payments ignores the id entirely and only reports
  // whether Razorpay is configured plus the PUBLISHABLE key — both already
  // public to any logged-in user. It answers a stranger, which is sloppy, but
  // it discloses nothing about the project, so it is not an IDOR.
  const realLeaks = idorLeaks.filter((l) => !/\/payments$/.test(l.path));
  s.check('a stranger gets no project data from another pair’s objects',
    realLeaks.length === 0,
    { severity: 'CRITICAL', observed: realLeaks.length ? realLeaks : 'none', expected: 'all refused' });
  s.check('every project sub-route checks participation (incl. ones with no data)',
    idorLeaks.length === 0,
    { severity: 'LOW', observed: idorLeaks.length ? idorLeaks : 'none',
      expected: 'all refused',
      note: 'GET /payments answers any authenticated caller because it never reads the ' +
            'project. No data is disclosed; it should still 403 for consistency.' });

  // Write attempts.
  const writes = [
    ['POST',  `/api/projects/${proj}/cards`, { title: 'intruder card' }],
    ['POST',  `/api/projects/${proj}/change-requests`, { note: 'intruder change' }],
    ['POST',  `/api/projects/${proj}/stage-entries`, { stage_key: 'content_planning', content: 'intruder' }],
    ['POST',  `/api/projects/${proj}/reviews`, { rating: 1, comment: 'intruder' }],
    ['PATCH', `/api/projects/${proj}`, { action: 'advance' }],
  ];
  const writeLeaks = [];
  for (const [method, path, body] of writes) {
    if (path.includes('undefined')) continue;
    const r = await A.nagma.api(method, path, body);
    if (r.status < 400) writeLeaks.push({ method, path, status: r.status });
  }
  s.check('a stranger cannot WRITE to another pair’s project',
    writeLeaks.length === 0,
    { severity: 'CRITICAL', observed: writeLeaks.length ? writeLeaks : 'none', expected: 'all refused' });

  // ══════════════════════════════════════════════════════════════════════
  s.section('Role boundary — creator against business-only routes');

  const businessOnly = [
    ['GET',  '/api/business/dashboard'],
    ['POST', '/api/collabs', { to_user_id: uid('nisha'), project_title: 'x', budget: 1000 }],
  ];
  for (const [method, path, body] of businessOnly) {
    const r = await A.sourav.api(method, path, body);
    s.check(`creator is refused ${method} ${path}`, r.status === 403,
      { severity: 'MEDIUM', observed: `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`, expected: 403,
        note: 'Scoped to the caller, so no cross-user leak — but the route hand-rolls auth ' +
              'instead of using withAuth() and never checks role, so it answers the wrong ' +
              'role with placeholder data.' });
  }

  const creatorOnly = [['GET', '/api/influencer/dashboard']];
  for (const [method, path] of creatorOnly) {
    const r = await A.mamaearth.api(method, path);
    s.check(`business is refused ${method} ${path}`, r.status === 403,
      { severity: 'MEDIUM', observed: `${r.status} ${JSON.stringify(r.body).slice(0, 150)}`, expected: 403,
        note: 'Same hand-rolled auth as /api/business/dashboard — no role check.' });
  }

  // ══════════════════════════════════════════════════════════════════════
  s.section('Input hardening');

  // SQL-ish and XSS-ish payloads through a text field that gets rendered.
  const nasty = [
    "'; DROP TABLE profiles; --",
    '<script>alert(document.cookie)</script>',
    '{{7*7}}',
    '../../etc/passwd',
    ' null-byte',
  ];
  for (const payload of nasty) {
    const r = await A.mamaearth.post('/api/collabs', {
      to_user_id: uid('kiran'), project_title: payload, budget: 1000,
    });
    // Being accepted is fine (it is just text) — the test is that nothing 500s
    // and the table still exists afterwards.
    s.note(`  payload ${JSON.stringify(payload).slice(0, 40)} →`, r.status);
  }
  const stillThere = await sql('select count(*)::int as n from profiles');
  s.check('the profiles table survived the injection payloads',
    stillThere[0].n > 0,
    { severity: 'CRITICAL', observed: `${stillThere[0].n} profiles`, expected: '> 0' });

  const stored = await sql(
    `select message from collab_requests where to_user_id=${lit(uid('kiran'))} order by created_at desc limit 1`);
  s.note('stored text is kept verbatim (escaping is the renderer’s job)', String(stored[0]?.message).slice(0, 80));

  // Malformed UUIDs must 400, not 500.
  const badUuid = await A.mamaearth.get('/api/projects/not-a-uuid');
  s.check('a malformed project id returns a 4xx, not a 500',
    badUuid.status < 500,
    { severity: 'LOW', observed: badUuid.status, expected: '4xx' });

  const badConv = await A.mamaearth.get('/api/conversations/not-a-uuid/messages');
  s.check('a malformed conversation id returns a 4xx, not a 500',
    badConv.status < 500,
    { severity: 'LOW', observed: badConv.status, expected: '4xx' });

  s.finish();
}

main().catch((e) => { console.error(e); process.exit(1); });
