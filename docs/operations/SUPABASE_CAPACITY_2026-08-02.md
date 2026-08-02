# Supabase capacity & tier planning — 2026-08-02

**Question this answers:** on the Supabase Free tier (and on Pro at $25/mo), how many users can we
carry, doing what, for how long, before something breaks — and which limit breaks first?

**Method:** every per-row number below was measured against the live dev project
(`jaajosocopoicmqcffuu`) on 2026-08-02, not estimated from generic guidance. Quotas were read from
supabase.com/pricing the same day. Activity rates (how often a user does a thing) are assumptions —
they are listed separately in §3 so you can change them and rerun the arithmetic.

---

## 1. The headline

**Database storage is not your constraint, and it is not close.** On Free, three other limits bind
long before the 500 MB fills, and one of them is disqualifying regardless of size.

Ranked by what stops you first on **Free**:

| # | Limit | Free quota | Est. ceiling for this app | Binds at |
|---|---|---|---|---|
| 1 | **Project pauses after 7 days idle** | — | **any production use** | day 7 of quiet |
| 2 | **Egress** | 5 GB/mo | **~600–1,500 monthly actives** | earliest real cap |
| 3 | **File storage** (social-cache) | 1 GB | **~880 creators** | |
| 4 | **Realtime concurrent** | 200 peak | **~2,000–4,000 registered** | at 5–10% concurrency |
| 5 | **Database size** | 500 MB | **~2,700 active creators** | |
| 6 | MAU | 50,000 | never reached | — |

On **Pro ($25/mo)** the ordering changes and everything gets far more headroom:

| # | Limit | Pro quota | Est. ceiling | Overage cost |
|---|---|---|---|---|
| 1 | **Realtime concurrent** | 500 peak | ~5,000–10,000 registered | $10 / 1,000 conns |
| 2 | **Egress** | 250 GB/mo | ~30,000–75,000 MAU | $0.09 / GB |
| 3 | **Database size** | 8 GB | ~45,000 active creators | $0.125 / GB |
| 4 | **File storage** | 100 GB | ~87,000 creators | $0.0213 / GB |
| 5 | MAU | 100,000 | — | $0.00325 / MAU |

**Practical read:** Free is fine for dev/staging and nothing else. Pro at $25 comfortably carries
**~10,000–25,000 registered users** for this app's usage shape, with realtime connections being the
first thing you'd pay to extend — and that extension is cheap ($10 per extra 1,000).

---

## 2. What is actually in the database today

Measured 2026-08-02. **17 MB total**, 45 auth users, 13 profiles.

| Schema | Tables | Heap | Indexes | Total |
|---|---|---|---|---|
| `pg_catalog` (Postgres internals) | 64 | 5.0 MB | 3.7 MB | **11 MB** |
| `public` (our 41 tables) | 41 | 512 kB | 1.9 MB | 3.2 MB |
| `auth` | 23 | 264 kB | 1.3 MB | 1.9 MB |
| `realtime` | 9 | 104 kB | 256 kB | 456 kB |
| `storage` | 8 | 80 kB | 208 kB | 376 kB |

Two things to notice:

**~14 MB of the 17 MB is a fixed floor**, not your data. It is Postgres's own catalogs plus the
minimum page allocation for 41 mostly-empty tables and their indexes. It does not grow with users.
So on Free you have **~483 MB of usable room**, not 500.

**The index-to-heap ratio in `public` currently reads 3.77×**, but that is an artifact of near-empty
tables (an index on 7 rows still allocates whole pages). At real volume this settles to roughly
1.5–2.5×. **All projections below use 2.0×**, which is mildly conservative.

---

## 3. The cost model

### 3a. Measured row widths (facts)

From `pg_stats`, the logical bytes per row:

| Table | Bytes/row | Scales with |
|---|---|---|
| `campaign_projects` | 1,105 | projects created |
| `social_snapshots` | 1,080 | creators × refresh frequency |
| `auth.users` | 595 | users (permanent) |
| `influencer_profiles` | 570 | creators (permanent) |
| `auth.identities` | 441 | users (permanent) |
| `business_profiles` | 238 | businesses (permanent) |
| `profiles` | 205 | users (permanent) |
| `notifications` | 198 | **activity — fastest grower** |
| `auth.sessions` | 189 | logins |
| `project_activity` | 166 | project events |
| `collab_requests` | 154 | requests sent |
| `auth.refresh_tokens` | 120 | logins |
| `project_stage_items` | 111 | project stages |
| `profile_views` | 60 | traffic |

### 3b. Assumed activity rates (change these if they're wrong)

Per **active creator, per year**: 150 notifications · 12 social snapshots (monthly refresh) ·
300 profile views received · 3 projects · 12 stage items per project · 20 activity events per
project · 15 collab requests · 40 emails · 5 logins retained.

### 3c. Resulting per-user footprint

| User type | Heap/yr | **With 2× indexes** |
|---|---|---|
| **Active creator** | ~91 KB | **~180 KB/yr** |
| **Active business** | ~60 KB | **~120 KB/yr** |
| **Dormant** (signs up, browses, stops) | ~6 KB | **~12 KB one-time** |

Identity rows (`auth.users` + `identities` + `profiles` + role profile ≈ **1.9 KB**) are permanent
and paid once. Everything else is activity and accumulates with time.

---

## 4. How many users fit

### Free — 483 MB usable

| Mix | Per user/yr | Year-1 capacity |
|---|---|---|
| All active creators | 180 KB | **~2,680** |
| Realistic (70% dormant / 30% active) | 62 KB | **~7,700** |
| All dormant signups | 12 KB | **~40,000** |

### Pro — 8,175 MB usable

| Mix | Per user/yr | Year-1 capacity |
|---|---|---|
| All active creators | 180 KB | **~45,400** |
| Realistic (70/30) | 62 KB | **~131,000** (MAU caps at 100k first) |
| All dormant signups | 12 KB | **~680,000** |

### The "how many days" dimension

For a **fixed** active-creator base, storage grows linearly. Time until the DB quota alone is hit:

| Active creators | Growth/yr | Free (483 MB) | Pro (8.2 GB) |
|---|---|---|---|
| 100 | 18 MB | ~27 years | never |
| 500 | 90 MB | ~5.4 years | ~90 years |
| 1,000 | 180 MB | **~2.7 years** | ~45 years |
| 5,000 | 900 MB | **~6 months** | ~9 years |
| 25,000 | 4.5 GB | ~5 weeks | **~1.8 years** |

Read this alongside §1: at 5,000 active creators you'd have blown the egress and realtime caps long
before the 6-month storage figure.

---

## 5. The limits that actually bite

### 5.1 Project pausing — the disqualifier for Free
Free projects pause after **7 days of inactivity**. Fine for dev. For anything user-facing this
alone rules Free out, independent of every number above.

### 5.2 Egress — the first real cap on Free
5 GB/month. Every dashboard load, API response and realtime payload counts. At a plausible
2–4 MB per session, that's roughly **1,200–2,500 sessions/month total** — call it **600–1,500
monthly actives**. This is the limit you'd hit first in practice. Pro's 250 GB is a **50×** jump and
is the single biggest reason to upgrade.

### 5.3 File storage — not all images are in Cloudinary
Worth correcting an assumption: user uploads (`avatars`, `profile-photos`, `business-logos`,
`project-assets`, `message-attachments`) are **all empty — those do go to Cloudinary**. But the
`social-cache` bucket holds **66 files / 8 MB** of cached social images, and it lives in Supabase
Storage, not Cloudinary.

That is **~122 KB per file, ~9.4 files per creator ≈ 1.14 MB per creator**:
- Free (1 GB): **~880 creators**
- Pro (100 GB): **~87,700 creators**

So on Free, cached social images run out **three times sooner than the database does**. Cheapest
fixes: move `social-cache` to Cloudinary (already paid for, 25 GB), or add a TTL that drops cached
images for creators nobody has viewed recently.

### 5.4 Realtime concurrency — the first cap on Pro
Seven tables are in the `supabase_realtime` publication (`campaign_projects`, `collab_requests`,
`notifications`, `project_change_requests`, `project_payments`, `project_stage_entries`,
`project_stage_items`). Every user sitting on a dashboard or project screen holds a connection.

| Peak concurrency | Free (200) | Pro (500) |
|---|---|---|
| 5% of users online | 4,000 registered | 10,000 registered |
| 10% online | 2,000 registered | 5,000 registered |
| 20% online | 1,000 registered | 2,500 registered |

Extending is cheap — **$10 per additional 1,000** — so this is a cost line, not a wall.

### 5.5 What chat costs you: nothing
Live messages are in **GetStream**, not Postgres. The `messages` table holds **24 rows / 48 kB** of
pre-Stream history and is effectively frozen. For a collaboration product this removes what would
normally be the single largest growth driver. Worth keeping that way.

---

## 6. Things to fix regardless of tier

1. **Nothing prunes anything.** `pg_cron` is not installed and there are no scheduled jobs. Every
   notification, activity row, profile view and email-delivery record lives forever. Adding
   retention (e.g. notifications > 90 days, `profile_views` > 180 days, `project_activity` on closed
   projects > 1 year) would cut the per-user growth figures in §3c by roughly half — the difference
   between 2.7 years and 5+ years of runway at 1,000 active creators.

2. **71% of auth users are abandoned signups.** 45 auth users, 13 profiles, **32 orphaned** — rows
   with no profile, kept forever. Partly a dev-testing artifact, but with Confirm-email off (see
   below) anyone can mint them freely in production. Worth a sweep of unconfirmed users older than
   ~30 days.

3. **Confirm-email is off** (`mailer_autoconfirm = true`). Beyond the security problem, it means
   unlimited junk-address signups each cost you permanent `auth.users` + `identities` + `profiles`
   rows. Tracked separately as a pre-production blocker.

4. **Staging shares dev's database.** Any capacity headroom here is shared across both environments,
   and production should be a separate project on its own quota.

---

## 7. Recommendation

- **Dev/staging: stay on Free.** 17 MB of 500 MB used. The 7-day pause is the only irritant, and it
  doesn't matter for non-production work.
- **Production: Pro, $25/mo, from day one** — not for the storage, but for the 50× egress, no
  pausing, and daily backups. Free cannot host a real user-facing deployment at any user count.
- **Expected real bill:** $25 flat carries roughly the first **10,000 registered users**. Beyond
  that the first overage is realtime connections at $10/1,000 — so ~$35–45/mo at 25,000 users.
  Database storage will not be what you pay for.
- **Highest-leverage engineering work**, in order: (1) add retention jobs, (2) move `social-cache`
  to Cloudinary, (3) turn on Confirm-email and sweep orphaned auth users.

---

*Row widths, quotas, bucket contents and table sizes measured 2026-08-02 against project
`jaajosocopoicmqcffuu`. Activity rates in §3b are assumptions; the tables recompute directly if you
change them.*
