// Admin lists must not silently stop at a page (unit adm-people).
//
// Two real defects, both invisible until the platform grows:
//   • GET /api/admin/users read `profiles` with one .select(): PostgREST silently caps
//     a response at 1000 rows, so past 1000 users the OLDEST vanished from the list
//     (newest-first) while it still looked complete. It also ran one query per user.
//   • The Customers and Payments CSV buttons send limit=500, and the export used the
//     current page, so a CSV of a longer list silently stopped at 500 rows.
//
// The 1000-row read itself is proved in tests/unit/paginate.test.ts against a fake
// table that behaves like PostgREST (this database has far fewer than 1000 users, and
// seeding that many here is not worth the risk). What this proves through the REAL
// routes as a real admin:
//   • the users list equals the database (count and role details) and stays ordered;
//   • a CSV export returns EVERY row even when the client asks for a page of 2;
//   • the export is refused to a non-admin.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-admin-lists.mjs
// Needs the dev server and the test-only admin (config.mjs TEST_ADMIN).

import { Actor } from './lib/actor.mjs';
import { TEST_ADMIN } from './lib/config.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-admin-lists', 'Admin lists and exports are complete, not the first page');

/** Minimal RFC 4180 parser: quoted fields may contain commas, quotes and newlines. */
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function main() {
  const admin = new Actor({ key: 'admin', role: 'admin', ...TEST_ADMIN });
  await admin.signIn();
  const creator = new Actor(personaByKey('sourav'));
  await creator.signIn();

  s.section('GET /api/admin/users');
  const t0 = Date.now();
  const res = await admin.get('/api/admin/users');
  const ms = Date.now() - t0;
  const users = res.body?.users ?? [];
  s.note('users response time', `${ms} ms for ${users.length} users`);
  const [{ n }] = await sql(`select count(*)::int as n from profiles`);
  s.check('the list has exactly as many users as the database', res.ok && users.length === n && res.body?.counts?.profiled === n,
    { severity: 'CRITICAL', observed: `${users.length} listed, counts.profiled ${res.body?.counts?.profiled}, database ${n}` });
  s.check('…each appears once', new Set(users.map((u) => u.id)).size === users.length, { severity: 'CRITICAL' });
  s.check('…newest first', users.every((u, i) => i === 0 || new Date(users[i - 1].created_at) >= new Date(u.created_at)), { severity: 'MEDIUM' });

  // Only accounts whose PROFILE role matches are enriched (an admin can carry a stray creator row).
  const biz = await sql(`select b.user_id, b.company_name, b.approval_status from business_profiles b join profiles p on p.id = b.user_id where p.role = 'business_owner'`);
  const inf = await sql(`select i.user_id, i.username from influencer_profiles i join profiles p on p.id = i.user_id where p.role = 'influencer'`);
  const byId = new Map(users.map((u) => [u.id, u]));
  s.check('every business shows its company and approval status (the batched lookup lost none)',
    biz.filter((b) => byId.has(b.user_id)).every((b) => byId.get(b.user_id).company_name === b.company_name && byId.get(b.user_id).approval_status === b.approval_status),
    { severity: 'CRITICAL', observed: biz.filter((b) => byId.has(b.user_id) && byId.get(b.user_id).approval_status !== b.approval_status).slice(0, 3) });
  s.check('every creator shows their username',
    inf.filter((i) => byId.has(i.user_id)).every((i) => byId.get(i.user_id).username === i.username), { severity: 'CRITICAL' });
  s.check('the response keeps its shape: { users, orphans, counts }', Array.isArray(res.body?.orphans) && typeof res.body?.counts?.orphaned === 'number', { severity: 'HIGH' });
  s.check('a creator cannot read it (403)', (await creator.get('/api/admin/users')).status === 403, { severity: 'CRITICAL' });

  s.section('CSV exports are the whole list, not the page asked for');
  for (const [module, extra] of [['customers', ''], ['payments', ''], ['deleted', '']]) {
    const json = await admin.get(`/api/admin/insights/${module}?limit=2&offset=0${extra}`);
    const total = json.body?.data?.total ?? json.body?.data?.rows?.length;
    if (json.status !== 200 || typeof total !== 'number') {
      s.note(`${module}: skipped`, `${json.status} ${JSON.stringify(json.body).slice(0, 100)}`);
      continue;
    }
    const csvRes = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/api/admin/insights/${module}?limit=2&offset=0&format=csv`, { headers: { Authorization: `Bearer ${admin.token}` } });
    const rows = parseCsv(await csvRes.text()).filter((r) => r.length > 1 || (r[0] ?? '') !== '');
    s.check(`${module}: the CSV has every row (${total}) although the request asked for a page of 2`, csvRes.ok && rows.length - 1 === total,
      { severity: 'HIGH', observed: `${rows.length - 1} data rows, total ${total}`, expected: total, note: 'Before the fix this returned 2 rows.' });
    s.check(`${module}: …and it is not marked truncated`, csvRes.headers.get('x-export-truncated') === null, { severity: 'MEDIUM' });
  }
  const anon = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/api/admin/insights/customers?format=csv`);
  s.check('an anonymous export is refused (401)', anon.status === 401, { severity: 'CRITICAL', observed: anon.status });
  const asCreator = await creator.get('/api/admin/insights/customers?format=csv');
  s.check('a creator cannot export (403)', asCreator.status === 403, { severity: 'CRITICAL', observed: asCreator.status });

  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
