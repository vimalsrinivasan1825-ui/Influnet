// Full core-loop exercise of the Influnet API against the local dev server +
// live dev DB. Seeds temp users (business, 2 influencers, admin), walks every
// core flow, records pass/fail, then deletes all temp data.
//
// Usage: with the dev server running on :3000,
//   node apps/web/scripts/e2e-exercise.mjs
// Requires apps/web/.env.local with NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_ACCESS_TOKEN (management API,
// used to seed/clean test rows via SQL).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local');
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n').filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = SB.match(/https:\/\/(\w+)\.supabase\.co/)[1];
const APP = 'http://localhost:3000';

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('SQL failed: ' + JSON.stringify(j));
  return j;
}

const S = Date.now();
const users = {
  biz:  { email: `tmp-e2e-biz-${S}@example.com`,  role: 'business_owner', name: 'E2E Biz' },
  inf:  { email: `tmp-e2e-inf-${S}@example.com`,  role: 'influencer',     name: 'E2E Creator Alpha' },
  inf2: { email: `tmp-e2e-inf2-${S}@example.com`, role: 'influencer',     name: 'E2E Creator Beta' },
  adm:  { email: `tmp-e2e-adm-${S}@example.com`,  role: 'admin',          name: 'E2E Admin' },
};
const PW = `Tmp-E2E-${S}!x`;

function userInsert(email) {
  return `INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', '${email}', crypt('${PW}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '') RETURNING id`;
}

async function seed() {
  for (const k of Object.keys(users)) {
    const u = users[k];
    const [{ id }] = await sql(userInsert(u.email));
    u.id = id;
    await sql(`
      INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), '${id}', jsonb_build_object('sub', '${id}', 'email', '${u.email}'), 'email', '${id}', now(), now(), now());
      INSERT INTO public.profiles (id, role, email, name, phone)
      VALUES ('${id}', '${u.role}'::public.user_role, '${u.email}', '${u.name}', '+910000000000');
    `);
  }
  await sql(`
    INSERT INTO public.business_profiles (user_id, company_name, username, approval_status, industry, city)
    VALUES ('${users.biz.id}', 'E2E Test Co', 'tmp_e2e_biz_${S}', 'approved', 'Tech', 'Chennai');
    INSERT INTO public.influencer_profiles (user_id, username, niche, headline, city)
    VALUES ('${users.inf.id}', 'tmp_e2e_inf_${S}', '["fitness"]'::jsonb, 'Fitness creator for E2E', 'Chennai'),
           ('${users.inf2.id}', 'tmp_e2e_inf2_${S}', '["tech"]'::jsonb, 'Tech creator for E2E', 'Mumbai');
  `);
  for (const k of Object.keys(users)) {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ email: users[k].email, password: PW }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`sign-in failed for ${k}: ` + JSON.stringify(j));
    users[k].token = j.access_token;
  }
}

async function cleanup() {
  try {
    await sql(`
      DELETE FROM public.campaign_projects WHERE owner_user_id IN ('${users.biz.id}') OR counterparty_user_id IN ('${users.inf.id}','${users.inf2.id}');
      DELETE FROM public.collab_requests WHERE from_user_id = '${users.biz.id}' OR to_user_id IN ('${users.inf.id}','${users.inf2.id}');
      DELETE FROM public.conversations c WHERE EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id IN ('${users.biz.id}','${users.inf.id}','${users.inf2.id}'));
      DELETE FROM public.profile_views WHERE influencer_user_id IN ('${users.inf.id}','${users.inf2.id}');
      DELETE FROM public.creator_profile_views WHERE creator_id IN ('${users.inf.id}','${users.inf2.id}');
      DELETE FROM public.notifications WHERE user_id IN ('${users.biz.id}','${users.inf.id}','${users.inf2.id}');
      DELETE FROM auth.users WHERE email LIKE 'tmp-e2e-%${S}@example.com';
    `);
    console.log('\ncleanup: done');
  } catch (e) { console.error('\nCLEANUP FAILED — manual cleanup needed:', e.message); }
}

// ---- tiny harness ----
const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note: note || '' });
    console.log(`  ✅ ${name}${note ? ' — ' + note : ''}`);
  } catch (e) {
    results.push({ name, ok: false, note: e.message });
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}
async function api(method, path, token, body) {
  const r = await fetch(APP + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, body: j };
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---- the exercise ----
try {
  await seed();
  console.log('seeded 3 users\n');
  let collabId, projectId, convId, conv2Id, cardId;

  console.log('— AUTH —');
  await check('401 without auth header', async () => {
    const r = await api('GET', '/api/profile', null);
    expect(r.status === 401, `got ${r.status}`);
  });
  await check('401 with garbage token', async () => {
    const r = await api('GET', '/api/profile', 'garbage.token.here');
    expect(r.status === 401, `got ${r.status}`);
  });

  console.log('— PROFILE —');
  await check('GET own profile (influencer) includes own email', async () => {
    const r = await api('GET', '/api/profile', users.inf.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    expect(r.body.profile?.email === users.inf.email, 'email missing from own profile');
    expect(r.body.profile?.username === `tmp_e2e_inf_${S}`, 'username missing');
  });
  await check('PATCH profile normal update', async () => {
    const r = await api('PATCH', '/api/profile', users.inf.token, { bio: 'Updated bio', name: 'E2E Creator Alpha' });
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('PATCH username conflict returns 409', async () => {
    const r = await api('PATCH', '/api/profile', users.inf2.token, { username: `tmp_e2e_inf_${S}` });
    expect(r.status === 409, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('PATCH profile as admin returns 403 (not 500 crash)', async () => {
    const r = await api('PATCH', '/api/profile', users.adm.token, { name: 'X' });
    expect(r.status === 403, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('PATCH profile rejects invalid field types (400)', async () => {
    const r = await api('PATCH', '/api/profile', users.inf.token, { name: 12345 });
    expect(r.status === 400, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });

  console.log('— DISCOVER —');
  await check('discover returns influencers, no PII columns', async () => {
    const r = await api('GET', '/api/discover', users.biz.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    const items = r.body.influencers || r.body.results || r.body.profiles || [];
    expect(Array.isArray(items) && items.length > 0, `no items: keys=${Object.keys(r.body)}`);
    const leaked = items.find(i => i.email || i.phone);
    expect(!leaked, 'PII leaked in discover results');
    return `${items.length} items`;
  });
  await check('discover search q= finds seeded creator', async () => {
    const r = await api('GET', '/api/discover?q=E2E%20Creator%20Alpha', users.biz.token);
    const items = r.body.influencers || r.body.results || [];
    expect(items.some(i => i.user_id === users.inf.id || i.id === users.inf.id), 'seeded creator not found by name search');
  });
  await check('discover ?id= single fetch (deep link)', async () => {
    const r = await api('GET', `/api/discover?id=${users.inf.id}`, users.biz.token);
    expect(r.status === 200, `got ${r.status}`);
    const items = r.body.influencers || r.body.results || [];
    expect(items.length >= 1 && (items[0].user_id === users.inf.id || items[0].id === users.inf.id), 'target not returned');
  });

  console.log('— COLLAB REQUESTS —');
  await check('influencer cannot POST collab (403)', async () => {
    const r = await api('POST', '/api/collabs', users.inf.token, { to_user_id: users.biz.id, project_title: 'x' });
    expect(r.status === 403, `got ${r.status}`);
  });
  await check('business creates collab request', async () => {
    const r = await api('POST', '/api/collabs', users.biz.token, {
      to_user_id: users.inf.id, project_title: 'E2E Campaign', project_description: 'Test campaign', budget: 25000,
    });
    expect(r.status === 200 && r.body.collab?.id, `got ${r.status}: ${JSON.stringify(r.body)}`);
    collabId = r.body.collab.id;
  });
  await check('duplicate pending collab returns 409', async () => {
    const r = await api('POST', '/api/collabs', users.biz.token, {
      to_user_id: users.inf.id, project_title: 'E2E Campaign dupe',
    });
    expect(r.status === 409, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('GET /api/collabs (list) works for business', async () => {
    const r = await api('GET', '/api/collabs', users.biz.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    expect(r.body.collabs?.some(c => c.id === collabId), 'created collab not in list');
  });
  await check('GET /api/collabs/:id works for receiver', async () => {
    const r = await api('GET', `/api/collabs/${collabId}`, users.inf.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('sender cannot accept own request', async () => {
    const r = await api('PATCH', '/api/collabs', users.biz.token, { id: collabId, status: 'accepted' });
    expect(r.status !== 200, `sender accepted own request (200)`);
  });
  await check('receiver accepts → project + conversation created', async () => {
    const r = await api('PATCH', '/api/collabs', users.inf.token, { id: collabId, status: 'accepted' });
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    expect(r.body.collab?.status === 'accepted', 'status not accepted');
  });
  await check('re-accept is idempotent (no duplicate project)', async () => {
    const r = await api('PATCH', '/api/collabs', users.inf.token, { id: collabId, status: 'accepted' });
    expect(r.status === 200, `got ${r.status}`);
    const rows = await sql(`SELECT count(*)::int AS n FROM public.campaign_projects WHERE collab_request_id = '${collabId}'`);
    expect(rows[0].n === 1, `expected 1 project, got ${rows[0].n}`);
  });

  console.log('— PROJECTS —');
  await check('GET /api/projects lists the new project', async () => {
    const r = await api('GET', '/api/projects', users.biz.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    const p = (r.body.projects || []).find(p => p.collab_request_id === collabId);
    expect(p, 'project from accepted collab not found');
    projectId = p.id;
    convId = p.conversation_id;
    return `project ${projectId}, conversation ${convId}`;
  });
  await check('non-participant cannot GET project (403/404)', async () => {
    const r = await api('GET', `/api/projects/${projectId}`, users.inf2.token);
    expect(r.status === 403 || r.status === 404, `got ${r.status}`);
  });
  await check('valid stage advance works', async () => {
    const r = await api('PATCH', `/api/projects/${projectId}`, users.biz.token, { action: 'advance' });
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    return `now at ${r.body.project?.current_stage}`;
  });
  await check('illegal stage jump rejected (400)', async () => {
    const r = await api('PATCH', `/api/projects/${projectId}`, users.biz.token, { action: 'advance', stage_key: 'final_payment' });
    expect(r.status === 400, `got ${r.status}: ${JSON.stringify(r.body)}`);
  });
  await check('kanban: create card', async () => {
    const r = await api('POST', `/api/projects/${projectId}/cards`, users.biz.token, { stage_key: 'project_discussion', title: 'E2E card' });
    expect(r.status === 200 && (r.body.card?.id || r.body.cards), `got ${r.status}: ${JSON.stringify(r.body)}`);
    cardId = r.body.card?.id;
  });
  await check('kanban: list + update + delete card', async () => {
    const l = await api('GET', `/api/projects/${projectId}/cards`, users.inf.token);
    expect(l.status === 200 && (l.body.cards || []).length >= 1, `list got ${l.status}`);
    const id = cardId || l.body.cards[0].id;
    const u = await api('PATCH', `/api/projects/${projectId}/cards/${id}`, users.inf.token, { title: 'E2E card renamed' });
    expect(u.status === 200, `update got ${u.status}: ${JSON.stringify(u.body)}`);
    const d = await api('DELETE', `/api/projects/${projectId}/cards/${id}`, users.biz.token);
    expect(d.status === 200, `delete got ${d.status}`);
  });

  console.log('— CONVERSATIONS & MESSAGES —');
  await check('conversations list shows accepted-collab conversation + enriched project', async () => {
    const r = await api('GET', '/api/conversations', users.biz.token);
    expect(r.status === 200, `got ${r.status}`);
    expect((r.body.conversations || []).some(c => c.id === convId), 'conversation missing');
    const proj = (r.body.projects || []).find(p => p.project_id === projectId);
    expect(proj?.partner?.username, 'project partner not enriched');
  });
  await check('send + receive message', async () => {
    const s = await api('POST', `/api/conversations/${convId}/messages`, users.biz.token, { content: 'Hello from E2E' });
    expect(s.status === 200, `send got ${s.status}: ${JSON.stringify(s.body)}`);
    const s2 = await api('POST', `/api/conversations/${convId}/messages`, users.inf.token, { content: 'Second message' });
    expect(s2.status === 200, `send 2 got ${s2.status}`);
    const g = await api('GET', `/api/conversations/${convId}/messages`, users.inf.token);
    expect(g.status === 200 && g.body.messages?.some(m => m.body === 'Hello from E2E'), 'message not visible to receiver');
    expect(g.body.messages.length === 2, `expected 2 messages, got ${g.body.messages.length}`);
  });
  await check('conversations list embeds only the latest message', async () => {
    const r = await api('GET', '/api/conversations', users.biz.token);
    const conv = (r.body.conversations || []).find(c => c.id === convId);
    expect(conv, 'conversation missing');
    expect(conv.messages?.length === 1, `expected 1 embedded message, got ${conv.messages?.length}`);
    expect(conv.messages[0].body === 'Second message', `newest message not returned: ${conv.messages[0].body}`);
  });
  await check('non-participant cannot read messages (403)', async () => {
    const r = await api('GET', `/api/conversations/${convId}/messages`, users.inf2.token);
    expect(r.status === 403, `got ${r.status}`);
  });
  await check('POST /api/conversations creates 1:1 (biz ↔ inf2)', async () => {
    const r = await api('POST', '/api/conversations', users.biz.token, { other_user_id: users.inf2.id });
    expect(r.status === 200 && r.body.conversation?.id, `got ${r.status}: ${JSON.stringify(r.body)}`);
    conv2Id = r.body.conversation.id;
    const again = await api('POST', '/api/conversations', users.biz.token, { other_user_id: users.inf2.id });
    expect(again.body.conversation?.id === conv2Id, 'not idempotent — second call made a new conversation');
  });
  await check('non-participant cannot delete conversation (403)', async () => {
    const r = await api('DELETE', `/api/conversations/${conv2Id}`, users.inf.token);
    expect(r.status === 403, `got ${r.status}`);
  });
  await check('participant deletes conversation', async () => {
    const r = await api('DELETE', `/api/conversations/${conv2Id}`, users.inf2.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    const rows = await sql(`SELECT count(*)::int AS n FROM public.conversations WHERE id = '${conv2Id}'`);
    expect(rows[0].n === 0, 'conversation row still exists');
  });

  console.log('— NOTIFICATIONS —');
  await check('collab request created a notification for receiver', async () => {
    const r = await api('GET', '/api/notifications', users.inf.token);
    expect(r.status === 200, `got ${r.status}`);
    expect(Array.isArray(r.body) && r.body.length > 0, 'no notifications for receiver');
    return `${r.body.length} notification(s), types: ${[...new Set(r.body.map(n => n.type))].join(', ')}`;
  });
  await check('summary endpoint returns counts', async () => {
    const r = await api('GET', '/api/notifications/summary', users.inf.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body)}`);
    return JSON.stringify(r.body);
  });
  await check('notifications GET tolerates garbage pagination params', async () => {
    const r = await api('GET', '/api/notifications?limit=abc&offset=-5', users.inf.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`);
  });
  await check('notifications PATCH rejects bad JSON and unknown action (400)', async () => {
    const raw = await fetch(APP + '/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users.inf.token}` },
      body: 'not-json{',
    });
    expect(raw.status === 400, `bad JSON got ${raw.status}`);
    const r = await api('PATCH', '/api/notifications', users.inf.token, { action: 'delete_everything' });
    expect(r.status === 400, `unknown action got ${r.status}`);
  });
  await check('mark all read → unread empty', async () => {
    const m = await api('PATCH', '/api/notifications', users.inf.token, { action: 'mark_read' });
    expect(m.status === 200, `mark got ${m.status}`);
    const r = await api('GET', '/api/notifications?unread=true', users.inf.token);
    expect(Array.isArray(r.body) && r.body.length === 0, `still ${r.body?.length} unread`);
  });

  console.log('— PUBLIC PROFILES & VIEW TRACKING —');
  await check('anon can call get_public_influencer, no PII', async () => {
    const r = await fetch(`${SB}/rest/v1/rpc/get_public_influencer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ p_slug: `tmp_e2e_inf_${S}` }),
    });
    const j = await r.json();
    expect(r.ok, `got ${r.status}: ${JSON.stringify(j).slice(0, 150)}`);
    const s = JSON.stringify(j);
    expect(!s.includes(users.inf.email) && !s.includes('+910000000000'), 'PII in public RPC response');
  });
  await check('anon cannot select profiles directly', async () => {
    const r = await fetch(`${SB}/rest/v1/profiles?select=email&limit=1`, { headers: { apikey: ANON } });
    expect(!r.ok, `anon read profiles.email got ${r.status}`);
  });
  await check('record_profile_view dedups within an hour', async () => {
    for (let i = 0; i < 3; i++) {
      await fetch(`${SB}/rest/v1/rpc/record_profile_view`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${users.biz.token}` },
        body: JSON.stringify({ p_influencer_user_id: users.inf.id, p_viewer_user_id: users.biz.id }),
      });
    }
    const rows = await sql(`SELECT count(*)::int AS n FROM public.profile_views WHERE influencer_user_id = '${users.inf.id}' AND viewer_user_id = '${users.biz.id}'`);
    expect(rows[0].n === 1, `expected 1 view row, got ${rows[0].n}`);
  });

  console.log('— DASHBOARDS & ADMIN GATING —');
  await check('business dashboard responds', async () => {
    const r = await api('GET', '/api/business/dashboard', users.biz.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  });
  await check('influencer dashboard responds', async () => {
    const r = await api('GET', '/api/influencer/dashboard', users.inf.token);
    expect(r.status === 200, `got ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  });
  await check('non-admin blocked from admin routes (403)', async () => {
    const r = await api('GET', '/api/admin/users', users.inf.token);
    expect(r.status === 403, `got ${r.status}`);
  });

  console.log('— STREAM —');
  await check('stream token endpoint issues token', async () => {
    const r = await api('POST', '/api/stream/token', users.inf.token);
    expect(r.status === 200 && (r.body.token || r.body.streamToken), `got ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  });

  const failed = results.filter(r => !r.ok);
  console.log(`\n========= ${results.length - failed.length}/${results.length} passed =========`);
  if (failed.length) {
    console.log('FAILURES:');
    for (const f of failed) console.log(`  ✗ ${f.name}: ${f.note}`);
  }
} finally {
  await cleanup();
}
