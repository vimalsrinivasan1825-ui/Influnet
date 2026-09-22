// Event registrations (migrations 170–172): influnet.io/join → entry pass → admin check-in.
//
// Proves through the REAL routes, with real JWTs:
//   • POST /api/event-pass mints an INF-XXXXXX pass; the same phone (any format)
//     gets the same pass back, and a repeat never reveals the stored name;
//   • a bad phone number is refused with field "phone";
//   • the admin report finds a registration by its pass code, and check-in /
//     undo round-trip through PATCH /api/admin/event-registrations/[id];
//   • delete moves a row to the Deleted section (freeing its phone), restore and
//     delete-forever work, and only already-deleted rows can be purged;
//   • a creator and an anonymous caller are refused on both admin routes;
//   • the retired Creator applications report and /api/join are gone.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-event-registrations.mjs
// Needs the dev server and the test-only admin (config.mjs TEST_ADMIN).
// Registers one test phone (91 90000 00091) up to twice and deletes every row it made.

import { Actor } from './lib/actor.mjs';
import { TEST_ADMIN } from './lib/config.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const EVENT = 'silicon-nexus-s2';
const PHONE = '9000000091';
const s = new Scenario('verify-event-registrations', 'Event pass registration and admin check-in');

const register = (body) =>
  fetch(`${BASE}/api/event-pass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: EVENT, ...body }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

async function main() {
  await sql(`delete from event_registrations where phone_digits like '9190000000%'`);
  const admin = new Actor({ key: 'admin', role: 'admin', ...TEST_ADMIN });
  await admin.signIn();
  const creator = new Actor(personaByKey('sourav'));
  await creator.signIn();

  s.section('Public registration');
  const first = await register({ name: 'QA Verify', phone: PHONE, email: 'qa@example.com', location: 'Chennai', instagram: 'https://instagram.com/qa.verify/' });
  const code = first.body?.passCode;
  s.check('a new registration gets an INF-XXXXXX pass (201)', first.status === 201 && /^INF-[A-Z0-9]{6}$/.test(code ?? ''),
    { severity: 'HIGH', observed: `${first.status} ${code}` });

  const again = await register({ name: 'Someone Else', phone: `+91 ${PHONE.slice(0, 5)} ${PHONE.slice(5)}` });
  s.check('the same phone in another format gets the SAME pass', again.body?.passCode === code && again.body?.alreadyRegistered === true,
    { severity: 'HIGH', observed: JSON.stringify(again.body) });
  s.check('…and the stored name is not revealed', again.body?.name === 'Someone Else',
    { severity: 'HIGH', observed: again.body?.name });

  const bad = await register({ name: 'QA Bad', phone: '12345' });
  s.check('a bad phone is refused on the phone field (400)', bad.status === 400 && bad.body?.field === 'phone',
    { severity: 'MEDIUM', observed: `${bad.status} ${JSON.stringify(bad.body)}` });

  const [row] = await sql(`select id, phone_digits, instagram_handle, checked_in_at from event_registrations where pass_code = '${code}'`);
  s.check('the row stores normalised phone and handle', row?.phone_digits === `91${PHONE}` && row?.instagram_handle === 'qa.verify',
    { severity: 'MEDIUM', observed: JSON.stringify(row) });

  s.section('Admin report + check-in');
  const report = await admin.get(`/api/admin/insights/event_registrations?search=${code}`);
  const found = report.body?.data?.rows ?? [];
  s.check('searching the pass code finds exactly that registration', report.ok && found.length === 1 && found[0].pass_code === code,
    { severity: 'HIGH', observed: `${report.status} ${found.length} rows` });
  const [{ n }] = await sql(`select count(*)::int as n from event_registrations where deleted_at is null`);
  s.check('the Registered KPI equals the table count', report.body?.data?.summary?.total === n,
    { severity: 'MEDIUM', observed: report.body?.data?.summary?.total, expected: n });

  const checkIn = await admin.patch(`/api/admin/event-registrations/${row.id}`, { checkedIn: true });
  const [afterIn] = await sql(`select checked_in_at from event_registrations where id = '${row.id}'`);
  s.check('check-in stamps checked_in_at', checkIn.ok && afterIn.checked_in_at !== null,
    { severity: 'HIGH', observed: `${checkIn.status} ${afterIn.checked_in_at}` });
  const filtered = await admin.get(`/api/admin/insights/event_registrations?status=checked_in&search=${code}`);
  s.check('the "Checked in" filter includes it', (filtered.body?.data?.rows ?? []).length === 1, { severity: 'MEDIUM' });

  const undo = await admin.patch(`/api/admin/event-registrations/${row.id}`, { checkedIn: false });
  const [afterUndo] = await sql(`select checked_in_at from event_registrations where id = '${row.id}'`);
  s.check('undo clears it', undo.ok && afterUndo.checked_in_at === null, { severity: 'HIGH', observed: afterUndo.checked_in_at });

  const csv = await fetch(`${BASE}/api/admin/insights/event_registrations?format=csv&search=${code}`, { headers: { Authorization: `Bearer ${admin.token}` } });
  s.check('CSV export includes the pass code', csv.ok && (await csv.text()).includes(code), { severity: 'MEDIUM', observed: csv.status });

  s.section('Delete, restore, delete forever (migration 172)');
  const livePurge = await admin.del(`/api/admin/event-registrations/${row.id}`);
  s.check('a live registration cannot be deleted permanently (409)', livePurge.status === 409,
    { severity: 'HIGH', observed: livePurge.status });

  const del = await admin.patch(`/api/admin/event-registrations/${row.id}`, { deleted: true });
  const active = await admin.get(`/api/admin/insights/event_registrations?search=${code}`);
  const trash = await admin.get(`/api/admin/insights/event_registrations?status=deleted&search=${code}`);
  s.check('delete moves it from the list into the Deleted section',
    del.ok && (active.body?.data?.rows ?? []).length === 0 && (trash.body?.data?.rows ?? []).length === 1,
    { severity: 'HIGH', observed: `${del.status} active=${active.body?.data?.rows?.length} deleted=${trash.body?.data?.rows?.length}` });
  const [{ live, gone }] = await sql(`select count(*) filter (where deleted_at is null)::int live, count(*) filter (where deleted_at is not null)::int gone from event_registrations`);
  s.check('KPIs count live rows only, and the Deleted count matches',
    trash.body?.data?.summary?.total === live && trash.body?.data?.summary?.deleted === gone,
    { severity: 'MEDIUM', observed: JSON.stringify(trash.body?.data?.summary), expected: `${live} live / ${gone} deleted` });
  const deletedCheckIn = await admin.patch(`/api/admin/event-registrations/${row.id}`, { checkedIn: true });
  s.check('a deleted registration cannot be checked in (404)', deletedCheckIn.status === 404,
    { severity: 'MEDIUM', observed: deletedCheckIn.status });

  const reReg = await register({ name: 'QA Verify Again', phone: PHONE });
  s.check('the same phone can register again after a delete, with a NEW pass',
    reReg.status === 201 && reReg.body?.passCode && reReg.body.passCode !== code,
    { severity: 'HIGH', observed: `${reReg.status} ${reReg.body?.passCode}` });
  const restoreClash = await admin.patch(`/api/admin/event-registrations/${row.id}`, { deleted: false });
  s.check('restoring is refused while that phone has a live registration (409)', restoreClash.status === 409,
    { severity: 'MEDIUM', observed: `${restoreClash.status} ${JSON.stringify(restoreClash.body)}` });

  const creatorDelete = await creator.patch(`/api/admin/event-registrations/${row.id}`, { deleted: false });
  const creatorPurge = await creator.del(`/api/admin/event-registrations/${row.id}`);
  s.check('a creator cannot delete, restore or purge (403)', creatorDelete.status === 403 && creatorPurge.status === 403,
    { severity: 'CRITICAL', observed: `${creatorDelete.status}/${creatorPurge.status}` });

  const purge = await admin.del(`/api/admin/event-registrations/${row.id}`);
  const [{ left }] = await sql(`select count(*)::int as left from event_registrations where id = '${row.id}'`);
  s.check('delete forever removes the row', purge.ok && left === 0, { severity: 'HIGH', observed: `${purge.status} rows left ${left}` });
  const [second] = await sql(`select id from event_registrations where pass_code = '${reReg.body?.passCode}'`);
  if (second) {
    await admin.patch(`/api/admin/event-registrations/${second.id}`, { deleted: true });
    const restore = await admin.patch(`/api/admin/event-registrations/${second.id}`, { deleted: false });
    s.check('restore brings a deleted registration back', restore.ok && restore.body?.deleted_at === null,
      { severity: 'HIGH', observed: `${restore.status} ${JSON.stringify(restore.body)}` });
  }

  s.section('Access control');
  const creatorReport = await creator.get('/api/admin/insights/event_registrations');
  s.check('a creator cannot read the report (403)', creatorReport.status === 403, { severity: 'CRITICAL', observed: creatorReport.status });
  const creatorPatch = await creator.patch(`/api/admin/event-registrations/${row.id}`, { checkedIn: true });
  s.check('a creator cannot check anyone in (403)', creatorPatch.status === 403, { severity: 'CRITICAL', observed: creatorPatch.status });
  const anon = await fetch(`${BASE}/api/admin/insights/event_registrations`);
  s.check('an anonymous caller is refused (401)', anon.status === 401, { severity: 'CRITICAL', observed: anon.status });

  s.section('Retired');
  const oldReport = await admin.get('/api/admin/insights/creator_applications');
  s.check('the creator_applications report is gone', oldReport.status === 404, { severity: 'LOW', observed: oldReport.status });
  const oldJoin = await fetch(`${BASE}/api/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  s.check('/api/join is gone', oldJoin.status === 404 || oldJoin.status === 405, { severity: 'LOW', observed: oldJoin.status });

  await sql(`delete from event_registrations where phone_digits like '9190000000%'`);
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
