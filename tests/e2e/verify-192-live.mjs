/**
 * Live proof, against the deployed dev app, that:
 *   1. a business is not billed and sees no paid product;
 *   2. a creator still is;
 *   3. /api/discover is an exact lookup and refuses to browse.
 *
 * Signs in as existing personas — it never seeds, so no email is sent and
 * NOTIFY_EMAILS_ENABLED does not need touching.
 */
import { Actor } from './lib/actor.mjs';
import { CREATORS, BUSINESSES } from './lib/personas.mjs';

const biz = new Actor(BUSINESSES.find((b) => b.key === 'mamaearth'));
const creator = new Actor(CREATORS.find((c) => c.key === 'sourav'));

let bad = 0;
const t = (name, ok, detail = '') => {
  if (!ok) bad++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

await biz.signIn();
await creator.signIn();
console.log(`signed in: business=${biz.name}  creator=${creator.name}\n`);

// ── 1. Entitlements ────────────────────────────────────────────────────────
console.log('1) GET /api/billing/entitlements');
const be = (await biz.get('/api/billing/entitlements')).body;
const ce = (await creator.get('/api/billing/entitlements')).body;
console.log(`   business: tier=${be.tier} billingApplies=${be.billingApplies} subscriptionsEnabled=${be.subscriptionsEnabled} activeProjects=${be.limits?.activeProjects} liveCampaigns=${be.limits?.liveCampaigns}`);
console.log(`   creator : tier=${ce.tier} billingApplies=${ce.billingApplies} subscriptionsEnabled=${ce.subscriptionsEnabled} activeProjects=${ce.limits?.activeProjects}`);
t('business is not billed', be.billingApplies === false);
t('business sees no paid product (hides all pricing UI)', be.subscriptionsEnabled === false);
t('business has no active-project ceiling', be.limits?.activeProjects === null);
t('business has no live-campaign ceiling', be.limits?.liveCampaigns === null);
t('creator is still billed', ce.billingApplies === true);
t('creator still sees the paid product', ce.subscriptionsEnabled === true);

// ── 2. Checkout is refused for a business ──────────────────────────────────
console.log('\n2) POST /api/billing/checkout as a business');
const co = await biz.post('/api/billing/checkout', {});
console.log(`   status=${co.status} body=${JSON.stringify(co.body).slice(0, 120)}`);
t('business cannot start a Pro checkout', co.status === 403);

// ── 3. Discover is an exact lookup ─────────────────────────────────────────
const handle = creator.persona.username; // 'souravjoshi'
const name = creator.persona.name;       // 'Sourav Joshi'
console.log(`\n3) GET /api/discover  (target creator @${handle})`);

const exact = await biz.get(`/api/discover?q=${encodeURIComponent(handle)}`);
t('exact username returns exactly one creator', exact.body?.results?.length === 1,
  `got ${exact.body?.results?.length} → ${exact.body?.results?.[0]?.username ?? '-'}`);

const atHandle = await biz.get(`/api/discover?q=${encodeURIComponent('@' + handle)}`);
t('@username works too', atHandle.body?.results?.length === 1);

const link = await biz.get(`/api/discover?q=${encodeURIComponent('https://influnet.io/' + handle)}`);
t('a pasted Influnet profile link resolves', link.body?.results?.length === 1);

const partial = await biz.get(`/api/discover?q=${encodeURIComponent(handle.slice(0, 6))}`);
t('a PARTIAL username finds nobody (no suggestions)', partial.body?.results?.length === 0,
  `"${handle.slice(0, 6)}" → ${partial.body?.results?.length}`);

const byName = await biz.get(`/api/discover?q=${encodeURIComponent(name)}`);
t('a real name finds nobody (not a search)', byName.body?.results?.length === 0,
  `"${name}" → ${byName.body?.results?.length}`);

const topic = await biz.get(`/api/discover?q=${encodeURIComponent('travel')}`);
t('a topic finds nobody', topic.body?.results?.length === 0);

const browse = await biz.get('/api/discover?niche=Lifestyle');
t('filter-only browse returns nothing rather than a roster', browse.body?.results?.length === 0,
  `status=${browse.status}`);

const ig = await biz.get(`/api/discover?q=${encodeURIComponent('https://instagram.com/' + creator.persona.instagramHandle)}`);
t('an Instagram URL does not resolve into our namespace', ig.body?.results?.length === 0);

console.log(bad === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${bad} LIVE CHECK(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
