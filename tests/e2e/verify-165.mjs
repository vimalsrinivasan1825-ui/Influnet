// Every collaboration-request event notifies the right person EXACTLY ONCE
// (migration 165 removed the database triggers that duplicated the API's own).
//
//   brand request → creator +1        peer request → recipient +1
//   accept → the sender +1            decline → the sender +1
//   reopen → the brand +1             campaign application accepted → the APPLICANT +1
//   and in every case the person who acted gets nothing.
//
// Before 165 each of the first five gained 2, and the application accept told the
// creator "New Collaboration Request" and the BRAND "Request Accepted".
//
// Usage: node --env-file=apps/web/.env.local tests/e2e/verify-165.mjs
// Needs the dev server (web-e2e profile) and seed-personas run first (fresh Free meters).

import { Actor } from './lib/actor.mjs';
import { Scenario } from './lib/scenario.mjs';
import { sql, lit } from './lib/sql.mjs';
import { personaByKey } from './lib/personas.mjs';

const s = new Scenario('verify-165', 'Collaboration request events notify exactly once');
const n = async (u) => (await sql(`select count(*)::int as n from notifications where user_id=${lit(u.userId)}`))[0].n;
async function gain(users, fn) {
  const before = await Promise.all(users.map(n));
  const result = await fn();
  const after = await Promise.all(users.map(n));
  return { result, gained: after.map((x, i) => x - before[i]) };
}
const latest = async (u) => (await sql(`select type, title, body, link from notifications where user_id=${lit(u.userId)} order by created_at desc limit 1`))[0];

async function main() {
  const boat = new Actor(personaByKey('boat')), sourav = new Actor(personaByKey('sourav'));
  const kiran = new Actor(personaByKey('kiran')), arjun = new Actor(personaByKey('arjunfit'));
  for (const a of [boat, sourav, kiran, arjun]) await a.signIn();
  await sql(`delete from collab_requests where status in ('pending','declined') and ((from_user_id=${lit(boat.userId)} and to_user_id in (${lit(kiran.userId)},${lit(arjun.userId)})) or (from_user_id=${lit(sourav.userId)} and to_user_id=${lit(arjun.userId)}))`);
  await sql(`delete from campaigns where title like 'E2E 165 %'`);

  s.section('Brand → creator request');
  const brandReq = await gain([boat, kiran], () => boat.post('/api/collabs', { to_user_id: kiran.userId, project_title: 'E2E 165 brand', project_description: 'x', budget: 1000 }));
  s.check('a brand request notifies the creator exactly once, the brand not at all', brandReq.result.ok && brandReq.gained[1] === 1 && brandReq.gained[0] === 0,
    { severity: 'HIGH', observed: `${brandReq.result.status}: brand +${brandReq.gained[0]}, creator +${brandReq.gained[1]}`, expected: 'creator +1, brand +0' });
  const reqId = (await sql(`select id from collab_requests where from_user_id=${lit(boat.userId)} and to_user_id=${lit(kiran.userId)} and status='pending' order by created_at desc limit 1`))[0].id;

  const acc = await gain([boat, kiran], () => kiran.patch('/api/collabs', { id: reqId, status: 'accepted' }));
  s.check('accepting notifies the brand exactly once, the creator not at all', acc.result.ok && acc.gained[0] === 1 && acc.gained[1] === 0,
    { severity: 'HIGH', observed: `${acc.result.status}: brand +${acc.gained[0]}, creator +${acc.gained[1]}` });

  s.section('Brand request that is declined, then reopened');
  await sql(`delete from collab_requests where from_user_id=${lit(boat.userId)} and to_user_id=${lit(arjun.userId)}`);
  await boat.post('/api/collabs', { to_user_id: arjun.userId, project_title: 'E2E 165 decline', project_description: 'x', budget: 1000 });
  const declId = (await sql(`select id from collab_requests where from_user_id=${lit(boat.userId)} and to_user_id=${lit(arjun.userId)} and status='pending' order by created_at desc limit 1`))[0].id;
  const dec = await gain([boat, arjun], () => arjun.patch('/api/collabs', { id: declId, status: 'declined' }));
  s.check('declining notifies the brand exactly once, the creator not at all', dec.result.ok && dec.gained[0] === 1 && dec.gained[1] === 0,
    { severity: 'HIGH', observed: `${dec.result.status}: brand +${dec.gained[0]}, creator +${dec.gained[1]}` });
  const reopen = await gain([boat, arjun], () => arjun.patch('/api/collabs', { id: declId, status: 'pending' }));
  s.check('reopening notifies the brand exactly once, the creator not at all', reopen.result.ok && reopen.gained[0] === 1 && reopen.gained[1] === 0,
    { severity: 'HIGH', observed: `${reopen.result.status}: brand +${reopen.gained[0]}, creator +${reopen.gained[1]}` });

  s.section('Creator → creator request');
  const peer = await gain([sourav, arjun], () => sourav.post('/api/collabs/peer', { to_user_id: arjun.userId, message: 'E2E 165 peer' }));
  s.check('a peer request notifies the recipient exactly once, the sender not at all', peer.result.status === 201 && peer.gained[1] === 1 && peer.gained[0] === 0,
    { severity: 'HIGH', observed: `${peer.result.status}: sender +${peer.gained[0]}, recipient +${peer.gained[1]}` });
  const peerId = (await sql(`select id from collab_requests where from_user_id=${lit(sourav.userId)} and to_user_id=${lit(arjun.userId)} and status='pending' order by created_at desc limit 1`))[0].id;
  const peerAcc = await gain([sourav, arjun], () => arjun.patch('/api/collabs', { id: peerId, status: 'accepted' }));
  s.check('accepting a peer request notifies the sender exactly once, the acceptor not at all', peerAcc.result.ok && peerAcc.gained[0] === 1 && peerAcc.gained[1] === 0,
    { severity: 'HIGH', observed: `${peerAcc.result.status}: sender +${peerAcc.gained[0]}, acceptor +${peerAcc.gained[1]}` });

  s.section('Campaign application accepted');
  const brief = { description: 'A proper brief with real substance, well over fifty characters long.', deliverables: 'One reel.', platforms: ['instagram'] };
  const made = await boat.post('/api/campaigns', { title: 'E2E 165 campaign', ...brief });
  const cid = made.body?.campaign?.id;
  await boat.patch(`/api/campaigns/${cid}`, { status: 'live' });
  const applied = await sourav.post(`/api/campaigns/${cid}/applications`, { pitch: 'I would love to make this reel for you.', proposed_rate: 20000 });
  const appId = (await sql(`select id from campaign_applications where campaign_id=${lit(cid)} and creator_user_id=${lit(sourav.userId)} limit 1`))[0]?.id;
  s.check('fixture: a live campaign with an application', Boolean(cid && appId), { severity: 'CRITICAL', observed: `${made.status} ${applied.status}` });
  const appAcc = await gain([boat, sourav], () => boat.patch(`/api/campaigns/${cid}/applications/${appId}`, { action: 'accept' }));
  s.check('accepting an application notifies the APPLICANT exactly once, and the brand (who acted) not at all',
    appAcc.result.ok && appAcc.gained[1] === 1 && appAcc.gained[0] === 0,
    { severity: 'HIGH', observed: `${appAcc.result.status}: brand +${appAcc.gained[0]}, applicant +${appAcc.gained[1]}`, expected: 'applicant +1, brand +0' });
  const note = await latest(sourav);
  s.check('…and it says so: "Your application was accepted", naming the campaign, linking to the chat',
    note?.title === 'Your application was accepted' && /E2E 165 campaign/.test(note.body) && /\/dashboard\/messages\?conv=/.test(note.link ?? ''),
    { severity: 'MEDIUM', observed: note });

  await sql(`delete from campaigns where title like 'E2E 165 %'`);
  await sql(`delete from collab_requests where status in ('pending','declined') and (from_user_id=${lit(boat.userId)} or from_user_id=${lit(sourav.userId)}) and to_user_id in (${lit(kiran.userId)},${lit(arjun.userId)})`);
  s.finish();
  process.exitCode = s.findings.length ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); });
