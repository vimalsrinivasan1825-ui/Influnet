// Account deletion must also remove the person from Stream Chat (F6 / acc-delete).
//
//   1. A persona opens chat, so a Stream user exists (checked on Stream itself).
//   2. They delete their account through the real DELETE /api/profile.
//   3. Stream no longer has that user.
//   4. Personas are re-seeded so later phases run clean.
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-stream-delete.mjs
// Needs the dev server (web-e2e profile) and the dev Stream app's key+secret.

import { StreamChat } from 'stream-chat';
import { spawnSync } from 'node:child_process';
import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-stream-delete', 'Account deletion removes the Stream chat user');

async function main() {
  const key = process.env.STREAM_API_KEY, secret = process.env.STREAM_API_SECRET;
  if (!key || !secret) {
    s.check('Stream credentials are present in the environment', false, { severity: 'HIGH', observed: 'missing STREAM_API_KEY / STREAM_API_SECRET' });
    s.finish(); return;
  }
  const stream = StreamChat.getInstance(key, secret);
  const nisha = new Actor(personaByKey('nisha'));
  await nisha.signIn();

  const tok = await nisha.post('/api/stream/token', {});
  s.check('the persona can open chat (token issued)', tok.ok, { severity: 'HIGH', observed: `${tok.status} ${JSON.stringify(tok.body).slice(0, 120)}` });
  const before = await stream.queryUsers({ id: nisha.userId });
  s.check('a Stream user exists for the persona before deletion', before.users.length === 1, { severity: 'HIGH', observed: before.users.length, expected: 1 });

  const del = await nisha.del('/api/profile', { reason_code: 'other', reason_text: 'verify-stream-delete' });
  s.check('self-service deletion succeeded', del.status === 200, { severity: 'CRITICAL', observed: `${del.status} ${JSON.stringify(del.body).slice(0, 160)}` });

  // Stream removes users asynchronously (deleteUser returns a task): poll.
  let gone = false;
  for (let i = 0; i < 20 && !gone; i++) {
    const r = await stream.queryUsers({ id: nisha.userId });
    gone = r.users.length === 0 || r.users[0].deleted_at != null;
    if (!gone) await new Promise((r) => setTimeout(r, 1000));
  }
  s.check('the Stream user is gone (or marked deleted) after the account is deleted', gone, { severity: 'HIGH', observed: 'still present after 20s', expected: 'removed' });

  s.section('Re-seed');
  const re = spawnSync('node', ['--env-file=apps/web/.env.local', 'tests/e2e/seed-personas.mjs'], { encoding: 'utf8' });
  s.check('personas re-seeded cleanly', re.status === 0, { severity: 'HIGH', observed: `exit ${re.status}` });
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
