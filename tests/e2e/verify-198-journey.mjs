// Verifies the admin user Journey (migration 198) and the lifecycle summary
// against the running dev server, as the test-only admin.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-198-journey.mjs
// Needs the dev server (BASE_URL, default http://localhost:3000) and
// seed-personas.mjs run at least once.
//
// Before 198 is applied the journey route must answer available:false (so the
// page falls back) — never an error and never an empty "available" history.
import { Actor } from './lib/actor.mjs';
import { TEST_ADMIN } from './lib/config.mjs';
import { personaByKey } from './lib/personas.mjs';
import { Scenario } from './lib/scenario.mjs';

const s = new Scenario('verify-198-journey', 'Admin user page: lifecycle + full journey');

try {
  const admin = new Actor({ key: 'admin', role: 'admin', ...TEST_ADMIN });
  await admin.signIn();
  const creator = new Actor(personaByKey('sourav'));
  await creator.signIn();

  s.section('GET /api/admin/users/[id] — lifecycle');
  const page = await admin.get(`/api/admin/users/${creator.userId}`);
  s.check('user page answers 200', page.status === 200, { observed: `status ${page.status}` });
  const lc = page.body?.lifecycle;
  s.check('lifecycle is present', !!lc, { observed: JSON.stringify(page.body ?? {}).slice(0, 200) });
  s.check('lifecycle has a state and headline', !!lc?.state && !!lc?.headline, { observed: `${lc?.state} — ${lc?.headline}` });
  s.check('milestones start with signup', lc?.milestones?.[0]?.key === 'signed_up', { observed: JSON.stringify(lc?.milestones?.map((m) => m.key)) });

  s.section('GET /api/admin/users/[id]/journey');
  const j = await admin.get(`/api/admin/users/${creator.userId}/journey`);
  s.check('journey answers 200', j.status === 200, { observed: `status ${j.status} ${JSON.stringify(j.body).slice(0, 200)}` });
  if (j.body?.available === false) {
    s.check('198 not applied → available:false with no events', Array.isArray(j.body.events) && j.body.events.length === 0);
  } else {
    const ev = j.body?.events ?? [];
    s.check('journey has events', ev.length > 0, { observed: `${ev.length} events` });
    s.check('newest first', ev.every((e, i) => i === 0 || ev[i - 1].at >= e.at));
    s.check('starts at signup (oldest is account_created or earlier)', ev.some((e) => e.kind === 'account_created'));
    s.check('every event has a category', ev.every((e) => typeof e.category === 'string' && e.category.length > 0));
    const cats = [...new Set(ev.map((e) => e.category))];
    s.note(`categories: ${cats.join(', ')}`);
    const before = await admin.get(`/api/admin/users/${creator.userId}/journey?before=${encodeURIComponent(ev[Math.floor(ev.length / 2)].at)}`);
    s.check('?before pages strictly older', (before.body?.events ?? []).every((e) => e.at < ev[Math.floor(ev.length / 2)].at));
  }

  s.section('Refused to a non-admin');
  const denied = await creator.get(`/api/admin/users/${creator.userId}/journey`);
  s.check('creator gets 401/403', denied.status === 401 || denied.status === 403, { observed: `status ${denied.status}` });
} catch (err) {
  s.check('script ran', false, { observed: String(err?.stack || err) });
}
s.finish();
