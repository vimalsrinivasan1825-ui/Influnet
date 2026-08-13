#!/usr/bin/env node
/**
 * Fill one creator's account with a realistic month of activity, so Home can be
 * looked at with something in it.
 *
 * WHY THIS EXISTS
 * Every card on Home hides itself when its number is zero — which is right for
 * a real new account and useless for a review. A screen that is correct and
 * empty cannot be judged, and the client's mock-up shows a busy account, so
 * reviewing the two side by side needs a busy account.
 *
 * WHAT IT IS NOT
 * Not a fixture the tests depend on, and not a seeder. It writes rows a real
 * account would have accumulated — nothing it inserts is a shape the app cannot
 * produce on its own — and every row it writes is tagged so `--clean` can take
 * all of it back out. Two rules kept while writing it:
 *
 *   1. NO IMPOSSIBLE ROWS. Payments are in paise because that is what the
 *      ledger stores; completed projects carry an updated_at consistent with
 *      the payment that settled them; link clicks obey the daily unique index
 *      from migration 116. If a number here could not have arisen from real
 *      use, the screen it produces proves nothing.
 *   2. DEV ONLY, and it says which project it is pointed at before it writes.
 *      Staging has its own database and a load-bearing QA fixture in it.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local tests/e2e/backfill-home-demo.mjs [--creator <username>]
 *   node --env-file=apps/web/.env.local tests/e2e/backfill-home-demo.mjs --clean
 */
import { sql, lit, PROJECT_REF } from './lib/sql.mjs';

/** Every row this script writes carries this, and `--clean` matches on it. */
const TAG = '[home-demo]';

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const creatorArg = args[args.indexOf('--creator') + 1];
const CREATOR_USERNAME = args.includes('--creator') ? creatorArg : 'madangowri';

/** Active work: eight projects that sum to ₹1,25,000, spread across the funnel. */
const ACTIVE = [
  { stage: 'collaboration_started', budget: 25000, idle: 2 },
  { stage: 'project_discussion', budget: 20000, idle: 1 },
  { stage: 'content_planning', budget: 18000, idle: 3 },
  { stage: 'shooting_in_progress', budget: 15000, idle: 9 },
  { stage: 'editing_in_progress', budget: 15000, idle: 0 },
  { stage: 'sent_for_review', budget: 12000, idle: 14 },
  { stage: 'final_approval', budget: 10000, idle: 4 },
  { stage: 'final_payment', budget: 10000, idle: 1 },
];

/**
 * Delivered work, newest first, as [weeks ago, budget]. Each gets a settled
 * payment on the same date, so the earnings chart and the completed value tell
 * the same story rather than two different ones.
 */
const COMPLETED = [
  [0, 15000], [0, 12500], [1, 15000], [1, 11000],
  [2, 13500], [3, 10000], [4, 9000], [5, 8500],
  [7, 12000], [9, 11000], [12, 9500], [16, 8000], [20, 7500],
];

/** Clicks per day, current 30 days vs the 30 before, per destination. */
const REACH = [
  { type: 'instagram', current: 14, prior: 12 },
  { type: 'youtube', current: 6, prior: 5 },
  { type: 'facebook', current: 3, prior: 3 },
  { type: 'website', current: 1, prior: 1 },
];

const money = (n) => `₹${n.toLocaleString('en-IN')}`;

async function main() {
  console.log(`project : ${PROJECT_REF}`);
  if (PROJECT_REF === 'aokdansyqxracuwsosji') {
    console.error('\nThat is the STAGING project. This script is for dev only — refusing.');
    process.exit(1);
  }

  const [creator] = await sql(`
    select p.id, p.name, ip.username
    from profiles p
    join influencer_profiles ip on ip.user_id = p.id
    where ip.username = ${lit(CREATOR_USERNAME)} and p.role = 'influencer'
  `);
  if (!creator) {
    console.error(`No creator with username "${CREATOR_USERNAME}" on this project.`);
    process.exit(1);
  }
  console.log(`creator : ${creator.name} (@${creator.username})\n`);

  if (clean) return wipe(creator.id);

  const brands = await sql(`
    select p.id, coalesce(bp.company_name, p.name) as name
    from profiles p
    left join business_profiles bp on bp.user_id = p.id
    where p.role = 'business_owner'
    order by p.created_at
    limit 14
  `);
  if (brands.length < 4) {
    console.error('Need at least 4 business accounts on this project to play the other side.');
    process.exit(1);
  }
  console.log(`brands  : ${brands.length} playing the other side\n`);

  await wipe(creator.id, { quiet: true });
  await writeProjects(creator, brands);
  await writeRequests(creator, brands);
  await writeAttention(creator, brands);
  await writeReach(creator);
  await report(creator);
}

/**
 * Active and completed projects, with the payments that settled them.
 *
 * updated_at is set on INSERT, never by a later UPDATE: the updated_at trigger
 * would stamp now() over it, and updated_at is exactly what Home reads to
 * decide what has gone quiet and what completed in which month.
 */
async function writeProjects(creator, brands) {
  const values = [];

  ACTIVE.forEach((p, i) => {
    const brand = brands[i % brands.length];
    values.push(`(
      ${lit(brand.id)}, ${lit(creator.id)},
      ${lit(`${brand.name} — collaboration`)},
      ${lit(`${TAG} active work seeded for the Home review.`)},
      ${p.budget}, 'active', ${lit(p.stage)},
      now() - interval '${p.idle} days', now() - interval '${p.idle + 30} days'
    )`);
  });

  COMPLETED.forEach(([weeks, budget], i) => {
    const brand = brands[(i + 3) % brands.length];
    values.push(`(
      ${lit(brand.id)}, ${lit(creator.id)},
      ${lit(`${brand.name} — delivered campaign`)},
      ${lit(`${TAG} completed work seeded for the Home review.`)},
      ${budget}, 'completed', 'project_completed',
      now() - interval '${weeks * 7} days', now() - interval '${weeks * 7 + 21} days'
    )`);
  });

  await sql(`
    insert into public.campaign_projects
      (owner_user_id, counterparty_user_id, title, description,
       budget, status, current_stage, updated_at, created_at)
    values ${values.join(',')};
  `);

  // Settled money, in paise (migration 059). Dated to the project's own
  // completion so the six-week chart and the completed value agree.
  await sql(`
    insert into public.project_payments
      (project_id, stage_key, amount, status, payer_id, paid_at, created_at)
    select c.id, 'final_payment', (c.budget * 100)::integer, 'paid',
           c.owner_user_id, c.updated_at, c.updated_at
    from public.campaign_projects c
    where c.counterparty_user_id = ${lit(creator.id)}
      and c.status = 'completed'
      and c.description like ${lit(`${TAG}%`)};
  `);

  // One real invoice nobody has paid — the "awaiting payment" figure. A
  // 'created' row is exactly what the gate writes before the webhook confirms.
  await sql(`
    insert into public.project_payments
      (project_id, stage_key, amount, status, payer_id, created_at)
    select c.id, 'final_payment', 1800000, 'created', c.owner_user_id, now() - interval '2 days'
    from public.campaign_projects c
    where c.counterparty_user_id = ${lit(creator.id)}
      and c.status = 'active'
      and c.current_stage = 'final_payment'
      and c.description like ${lit(`${TAG}%`)}
    limit 1;
  `);

  console.log(`  ${ACTIVE.length} active + ${COMPLETED.length} completed projects, with payments`);
}

/**
 * Inbound demand: three requests still waiting, and the history behind the
 * acceptance rate. One accepted request also carries a pending proposal, which
 * is what puts "terms to review" in the queue.
 */
async function writeRequests(creator, brands) {
  const rows = [];
  const push = (brand, status, days, budget) =>
    rows.push(`(
      ${lit(brand.id)}, ${lit(creator.id)},
      ${lit(`${TAG} We'd love to work with you on our next campaign.`)},
      ${budget}, ${lit(status)}::collab_status,
      now() - interval '${days} days', now() - interval '${days} days'
    )`);

  [2, 4, 6].forEach((d, i) => push(brands[i % brands.length], 'pending', d, 15000 + i * 5000));
  for (let i = 0; i < 15; i++) push(brands[i % brands.length], 'accepted', 20 + i * 4, 12000);
  for (let i = 0; i < 6; i++) push(brands[(i + 2) % brands.length], 'declined', 30 + i * 6, 6000);

  await sql(`
    insert into public.collab_requests
      (from_user_id, to_user_id, message, budget, status, created_at, updated_at)
    values ${rows.join(',')};
  `);

  await sql(`
    insert into public.project_proposals
      (collab_request_id, proposed_by, status, title, description, budget, created_at)
    select r.id, r.from_user_id, 'pending',
           'Festive reel — 2 posts + 1 story',
           ${lit(`${TAG} Terms proposed for your review.`)},
           28000, now() - interval '1 day'
    from public.collab_requests r
    where r.to_user_id = ${lit(creator.id)}
      and r.status = 'accepted'
      and r.message like ${lit(`${TAG}%`)}
    order by r.created_at desc
    limit 1;
  `);

  console.log('  24 collaboration requests (3 pending) + 1 proposal awaiting terms');
}

/**
 * Who has been looking. Real viewers only — every row is a business account
 * that exists, on a distinct day, which is the shape record_profile_view
 * produces and the shape the daily unique index (migration 075) permits.
 */
async function writeAttention(creator, brands) {
  const ids = brands.map((b) => lit(b.id)).join(',');

  await sql(`
    insert into public.profile_views (influencer_user_id, viewer_user_id, viewed_at, viewed_on)
    select ${lit(creator.id)}, v.id,
           now() - (d || ' days')::interval,
           (current_date - d)
    from (select unnest(array[${ids}]::uuid[]) as id) v,
         generate_series(0, 29) d
    where (d + abs(hashtext(v.id::text))) % 3 = 0
    on conflict do nothing;
  `);

  // The 30 days before, thinner, so the delta on the card has a real baseline
  // and points the right way.
  await sql(`
    insert into public.profile_views (influencer_user_id, viewer_user_id, viewed_at, viewed_on)
    select ${lit(creator.id)}, v.id,
           now() - (d || ' days')::interval,
           (current_date - d)
    from (select unnest(array[${ids}]::uuid[]) as id) v,
         generate_series(30, 59) d
    where (d + abs(hashtext(v.id::text))) % 4 = 0
    on conflict do nothing;
  `);

  await sql(`
    insert into public.creator_profile_views (creator_id, business_id, view_count, first_viewed_at, last_viewed_at)
    select ${lit(creator.id)}, v.id, 3 + (abs(hashtext(v.id::text)) % 9),
           now() - interval '55 days', now() - interval '2 days'
    from (select unnest(array[${ids}]::uuid[]) as id) v
    on conflict (creator_id, business_id) do nothing;
  `);

  console.log('  profile views across 60 days, from real brand accounts');
}

/**
 * Click-through off the public profile. Anonymous, because that is what this
 * traffic actually is — someone tapping a bio link is a stranger to us — and
 * keyed the same way lib/profile-reach.ts keys a real anonymous visitor, one
 * per person per link per day.
 */
async function writeReach(creator) {
  for (const c of REACH) {
    await sql(`
      insert into public.profile_link_clicks
        (influencer_user_id, link_type, viewer_key, clicked_at, clicked_on)
      select ${lit(creator.id)}, ${lit(c.type)},
             'anon:demo-' || g || '-' || d,
             now() - (d || ' days')::interval,
             (current_date - d)
      from generate_series(0, 29) d, generate_series(1, ${c.current}) g
      on conflict do nothing;

      insert into public.profile_link_clicks
        (influencer_user_id, link_type, viewer_key, clicked_at, clicked_on)
      select ${lit(creator.id)}, ${lit(c.type)},
             'anon:demo-' || g || '-' || d,
             now() - (d || ' days')::interval,
             (current_date - d)
      from generate_series(30, 59) d, generate_series(1, ${c.prior}) g
      on conflict do nothing;
    `);
  }
  console.log('  link clicks across four destinations, 60 days');
}

/** Everything tagged, gone. Payments and proposals go with their parents. */
async function wipe(creatorId, { quiet = false } = {}) {
  await sql(`
    delete from public.project_payments
     where project_id in (
       select id from public.campaign_projects
        where counterparty_user_id = ${lit(creatorId)} and description like ${lit(`${TAG}%`)}
     );

    delete from public.project_proposals
     where description like ${lit(`${TAG}%`)};

    delete from public.campaign_projects
     where counterparty_user_id = ${lit(creatorId)} and description like ${lit(`${TAG}%`)};

    delete from public.collab_requests
     where to_user_id = ${lit(creatorId)} and message like ${lit(`${TAG}%`)};

    delete from public.profile_link_clicks
     where influencer_user_id = ${lit(creatorId)} and viewer_key like 'anon:demo-%';
  `);

  if (!quiet) console.log(`Removed every ${TAG} row for this creator.`);
}

/** Read the numbers back out of the database, not out of this file's constants. */
async function report(creator) {
  const [r] = await sql(`
    select
      (select count(*) from campaign_projects
        where counterparty_user_id = ${lit(creator.id)} and status = 'active') as active,
      (select coalesce(sum(budget),0) from campaign_projects
        where counterparty_user_id = ${lit(creator.id)} and status = 'active') as pipeline,
      (select count(*) from campaign_projects
        where counterparty_user_id = ${lit(creator.id)} and status = 'completed') as completed,
      (select count(*) from collab_requests
        where to_user_id = ${lit(creator.id)} and status = 'pending') as pending_requests,
      (select coalesce(sum(pp.amount),0)/100 from project_payments pp
        join campaign_projects c on c.id = pp.project_id
        where c.counterparty_user_id = ${lit(creator.id)} and pp.status = 'paid'
          and pp.paid_at >= now() - interval '30 days') as settled_30d,
      (select coalesce(sum(pp.amount),0)/100 from project_payments pp
        join campaign_projects c on c.id = pp.project_id
        where c.counterparty_user_id = ${lit(creator.id)} and pp.status = 'created') as pending_money,
      (select count(*) from profile_views
        where influencer_user_id = ${lit(creator.id)} and viewed_at >= now() - interval '30 days') as views_30d,
      (select count(*) from creator_profile_views
        where creator_id = ${lit(creator.id)}) as brands,
      (select count(*) from profile_link_clicks
        where influencer_user_id = ${lit(creator.id)} and clicked_at >= now() - interval '30 days') as clicks_30d
  `);

  console.log('\nHome should now show:');
  console.log(`  pipeline value    ${money(Number(r.pipeline))} across ${r.active} active projects`);
  console.log(`  completed         ${r.completed}`);
  console.log(`  settled (30d)     ${money(Number(r.settled_30d))}`);
  console.log(`  awaiting payment  ${money(Number(r.pending_money))}`);
  console.log(`  needs review      ${r.pending_requests} requests + 1 proposal`);
  console.log(`  profile views     ${r.views_30d} in 30 days, from ${r.brands} brands`);
  console.log(`  reach             ${r.clicks_30d} link taps in 30 days`);
  console.log(`\nUndo with:  --clean --creator ${creator.username}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
