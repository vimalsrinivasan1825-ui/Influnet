// Pre-event survey (migrations 174–175): influnet.io/join/survey → admin.
//
// Proves through the REAL routes, with real JWTs:
//   • lookup by phone (any format) finds the registration, returns the live
//     questions for both roles, and never returns the full email or phone;
//   • an unknown number is { found: false }, and submit for it is a 404;
//   • submit stores answers against the registration, a resubmit overwrites;
//   • the admin list shows the response with the registrant's details;
//   • an admin edit (reword, reorder, add question + option) is what the next
//     lookup returns, new ids come from the wording, and old ids are kept;
//   • a bad form (duplicate ids, one option, no title) is refused;
//   • a creator and an anonymous caller are refused on the admin route.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-event-survey.mjs
// Needs the dev server and the test-only admin (config.mjs TEST_ADMIN).
// Registers one test phone (91 90000 00092), deletes it after, and puts the
// creator form back exactly as it was — even if a check throws.

import { Actor } from './lib/actor.mjs';
import { TEST_ADMIN } from './lib/config.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
const EVENT = 'silicon-nexus-s2';
const PHONE = '9000000092';
const s = new Scenario('verify-event-survey', 'Pre-event survey and its admin editor');

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: EVENT, ...body }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const survey = (body) => post('/api/event-survey', body);

async function main() {
  await sql(`delete from event_registrations where phone_digits = '91${PHONE}'`);
  const admin = new Actor({ key: 'admin', role: 'admin', ...TEST_ADMIN });
  await admin.signIn();
  const creator = new Actor(personaByKey('sourav'));
  await creator.signIn();

  const start = await admin.get('/api/admin/event-survey');
  const original = start.body?.forms?.creator;
  s.check('admin can read both forms', start.status === 200 && original?.length > 0 && start.body.forms.business?.length > 0,
    { severity: 'HIGH', observed: `${start.status} creator=${original?.length}` });
  if (!original?.length) return s.finish();

  try {
    s.section('Lookup');
    const miss = await survey({ action: 'lookup', phone: PHONE });
    s.check('an unregistered number is { found: false }', miss.status === 200 && miss.body?.found === false,
      { severity: 'MEDIUM', observed: JSON.stringify(miss.body) });

    await post('/api/event-pass', { name: 'Survey Verify', phone: PHONE, email: 'survey.verify@example.com', location: 'Chennai' });
    const hit = await survey({ action: 'lookup', phone: `+91 ${PHONE.slice(0, 5)} ${PHONE.slice(5)}` });
    const text = JSON.stringify(hit.body);
    s.check('the registered number is found in another format', hit.body?.found === true && hit.body.registrant.firstName === 'Survey',
      { severity: 'HIGH', observed: text });
    s.check('…with the live questions for both roles',
      hit.body?.questions?.creator?.length === original.length && hit.body.questions.business?.length > 0,
      { severity: 'HIGH', observed: Object.keys(hit.body?.questions ?? {}).join(',') });
    s.check('…and never the full email or phone',
      !text.includes('survey.verify@example.com') && !text.includes(PHONE) && hit.body?.registrant?.emailMasked?.startsWith('su'),
      { severity: 'CRITICAL', observed: hit.body?.registrant?.emailMasked });

    s.section('Submit');
    const unknown = await survey({ action: 'submit', phone: '9000000093', role: 'creator', answers: {} });
    s.check('submitting for an unregistered number is 404', unknown.status === 404, { severity: 'MEDIUM', observed: unknown.status });
    const badRole = await survey({ action: 'submit', phone: PHONE, role: 'admin', answers: {} });
    s.check('an unknown role is refused (400)', badRole.status === 400, { severity: 'MEDIUM', observed: badRole.status });

    await survey({ action: 'submit', phone: PHONE, role: 'creator', answers: { followers: 'lt_10k' } });
    const second = await survey({ action: 'submit', phone: PHONE, role: 'business', answers: { thoughts: 'Second go' } });
    const stored = await sql(`select s.role, s.answers from event_survey_responses s join event_registrations r on r.id = s.registration_id where r.phone_digits = '91${PHONE}'`);
    s.check('a resubmit overwrites: one row, the latest answers', second.status === 201 && stored.length === 1 &&
      stored[0].role === 'business' && stored[0].answers.thoughts === 'Second go',
      { severity: 'HIGH', observed: JSON.stringify(stored) });

    const list = await admin.get('/api/admin/event-survey');
    const mine = list.body?.responses?.find((r) => r.registration?.phone_digits === `91${PHONE}`);
    s.check('the admin list shows the response with the registrant', mine?.registration?.name === 'Survey Verify' && mine.role === 'business',
      { severity: 'HIGH', observed: JSON.stringify(mine ?? null).slice(0, 200) });

    s.section('Form editor');
    const [first, second_, ...rest] = original;
    const edited = [
      second_,
      { ...first, title: `${first.title} (edited)` },
      ...rest,
      { id: 'dream_brand', kind: 'multi', title: 'Dream brand?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], max: 1 },
    ];
    const save = await admin.put('/api/admin/event-survey', { role: 'creator', questions: edited });
    s.check('an admin can save the form', save.status === 200 && save.body?.ok, { severity: 'HIGH', observed: `${save.status} ${JSON.stringify(save.body).slice(0, 160)}` });
    const after = await survey({ action: 'lookup', phone: PHONE });
    const live = after.body?.questions?.creator ?? [];
    s.check('the next lookup gets the new order, wording and question',
      live[0]?.id === second_.id && live[1]?.title.endsWith('(edited)') && live[1]?.id === first.id && live.at(-1)?.id === 'dream_brand',
      { severity: 'HIGH', observed: live.map((q) => q.id).join(',') });

    for (const [label, questions] of [
      ['duplicate question ids', [first, first]],
      ['a choice with one option', [{ ...first, options: first.options.slice(0, 1) }]],
      ['a question with no title', [{ ...first, title: '  ' }]],
    ]) {
      const bad = await admin.put('/api/admin/event-survey', { role: 'creator', questions });
      s.check(`a form with ${label} is refused (400)`, bad.status === 400, { severity: 'MEDIUM', observed: `${bad.status} ${bad.body?.error}` });
    }

    s.section('Access');
    const creatorGet = await creator.get('/api/admin/event-survey');
    const creatorPut = await creator.put('/api/admin/event-survey', { role: 'creator', questions: original });
    s.check('a creator cannot read or edit the survey (403)', creatorGet.status === 403 && creatorPut.status === 403,
      { severity: 'CRITICAL', observed: `${creatorGet.status}/${creatorPut.status}` });
    const anon = await fetch(`${BASE}/api/admin/event-survey`);
    s.check('an anonymous caller is refused (401)', anon.status === 401, { severity: 'CRITICAL', observed: anon.status });
  } finally {
    const restore = await admin.put('/api/admin/event-survey', { role: 'creator', questions: original });
    const [row] = await sql(`select questions from event_survey_forms where event_slug = '${EVENT}' and role = 'creator'`);
    s.check('the creator form is restored exactly', restore.status === 200 && JSON.stringify(row?.questions) === JSON.stringify(original),
      { severity: 'HIGH', observed: restore.status });
    await sql(`delete from event_registrations where phone_digits = '91${PHONE}'`);
  }

  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
