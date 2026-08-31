# Freemium limits — analysis & build plan (2026-08-31)

Scope: the eight Free-tier ceilings the founder listed, plus the two cross-cutting
asks that came with them — **make the Free plan visible** (especially on mobile)
and **build real re-engagement notifications** ("you haven't opened the app in
days", "3 new campaigns since you were here").

This document is analysis + a commit-by-commit build order. Nothing here is
committed yet. Open product questions are collected in the last section — those
block the features they touch, not the whole plan.

---

## 0. What already exists (so we build *with* it, not beside it)

The paid tier is not a greenfield. Migrations 115 → 137 built a complete
entitlement spine:

| Piece | Where | What it does |
|---|---|---|
| `billing_settings` (1 row) | migration 115, extended 117/127 | every Free ceiling as a column; `NULL` = "no limit"; `db_enforcement_enabled` master switch |
| `subscriptions` | migration 115 | one row per payer, written **only** by the signed Razorpay webhook |
| `current_tier()` / `get_entitlements()` | migration 115, rewritten 117/131 | derived tier + one JSONB blob of `{tier, limits, freeLimits, usage, price}` |
| `consume_quota()` / `release_quota()` / weekly twins | 115 / 131 | atomic "increment-or-refuse" for metered features |
| `enforce_*_quota()` BEFORE-INSERT triggers | 115 (projects), 131 (campaigns) | DB backstop behind an advisory lock, so a route that forgets still can't over-grant |
| `feature_flags` table + `lib/feature-flags.ts` | migration 137 | runtime `subscriptions` on/off, 45s TTL, env fallback |
| `packages/core/src/entitlements.ts` | — | shared vocabulary: `PlanTier`, `GatedFeature`, `Entitlements` type, `hasFeature`, `isOverLimit`, `formatPrice`. **Carries names only, never numbers.** |
| `lib/entitlements.ts` | web | `requireFeature` / `requireQuota` / `canSee` / `paywall` (402) helpers |
| `lib/hooks/use-entitlements.ts` | web | client hook → `GET /api/billing/entitlements` |
| `components/dashboard/plan-nudge.tsx` | web | "you're near / at a limit" card, frequency-capped, localStorage snooze |
| `components/dashboard/upgrade-card.tsx` | web | full Free-vs-Pro comparison + Razorpay checkout, on `/dashboard/billing` |
| `lib/notify.ts` | web | `notifyUser()` → `notifications` row + Expo push + optional email. **Already has `type: 'nudge'` and `type: 'upsell'` defined.** |

### The established pattern for adding one limit

1. `billing_settings` gets a `free_<thing>` column (nullable INT).
2. `get_entitlements()` is re-`CREATE OR REPLACE`d to project the new
   `limits.<thing>` / `freeLimits.<thing>` / `usage.<thing>` keys. (This function
   is rewritten whole in every migration that touches it — 115, 117, 131. Ours
   will be 138+.)
3. `packages/core/entitlements.ts` — add the key to the `Entitlements` interface
   (both `limits` and `freeLimits`), to `unlimitedEntitlements()` /
   `freeFallback()` in `lib/entitlements.ts`, and if it's a hard gate add a
   `GatedFeature` key + `FEATURES_BY_TIER` entry + `FEATURE_LABELS` line.
4. Enforcement: either a metered `consume_quota` meter + `requireQuota`-style
   helper, **or** a `BEFORE INSERT` trigger for a standing count, **or** a
   `canSee`-style read gate for "show less data".
5. Web UI: usage meter on `/dashboard/billing`, a `plan-nudge` reason, and an
   inline paywall at the point of action.
6. Mobile UI: **nothing exists yet — see §9.**

### Current known gaps in the spine

- **`SUBSCRIPTIONS_ENABLED` / `feature_flags.subscriptions`** — `true` in
  `deploy-staging.yml`, driven by a repo variable on dev (`vars.SUBSCRIPTIONS_ENABLED`).
  Confirm the dev value before assuming Free limits bite on dev.
- **DB enforcement rollout** — migration 117 flipped `db_enforcement_enabled = TRUE`,
  but 115/117/127/131 are **dev-only**; staging/prod DBs have never seen them
  (per `docs/operations` migration-state notes). Any new limit inherits this: it
  is inert everywhere until the whole 115→13x chain is pushed to staging.
- **Mobile** has no entitlements client, no billing screen, no Pro badge, no
  usage surface whatsoever.

---

## 1. Projects — 5 (and 2 concurrent)

**Status: built, enforced on dev, invisible on mobile, no point-of-action card.**

- `free_active_projects = 2` (concurrent), `free_project_conversions = 5`
  (lifetime, never resets) — migrations 115 + 117.
- Enforced by `enforce_project_quota()` BEFORE-INSERT trigger on
  `campaign_projects` — races handled, Pro exempt.
- Web: `plan-nudge` has `projects` + `conversions` reasons; `upgrade-card` shows
  both meters; `POST /api/conversations/[id]/deal` maps the DB exception to 402.

**Gaps → work:**

1. **No "1 created, 4 left" confirmation card.** After a project is created
   (proposal accepted), nothing tells a Free brand where they now stand. Add a
   post-creation toast/card on web *and* mobile: *"Project created. 2 of 5 free
   project conversions used."* Data already in `entitlements.usage.projectConversions`.
2. **Mobile:** projects list + project detail never mention the cap; the "propose
   project" / "accept proposal" action gives a raw error if the trigger fires.
   Needs the mobile entitlements client (§9) + a paywall sheet.
3. **Copy:** decide whether "5" is *conversions ever* (current) or should also
   surface as "you can start 5 campaigns on Free". Current wording in
   `upgrade-card.tsx` is already careful about this; keep it consistent.

Commit: `feat(billing): project-quota confirmation card (web + mobile)` — after §9.

---

## 2. Business-owner contact info — 5

**Status: does not exist. New feature.**

Today `GET /api/businesses/[username]` exposes only `website`. There is no
phone / point-of-contact field surfaced to creators, and no "reveal" gate.

**Proposed design:**

- The scarce thing is a **brand's direct contact details** (phone / email / POC
  name) that a creator can see *before* a deal. A creator may reveal **5 distinct
  businesses' contact cards ever** on Free; the 6th prompts Pro.
- New table `business_contact_reveals (creator_id, business_id, revealed_at,
  PRIMARY KEY (creator_id, business_id))` — the lifetime count is
  `COUNT(*) WHERE creator_id = me`, ungameable (same reasoning as
  `projectConversions`). RLS: creator reads/inserts own rows only.
- `billing_settings.free_contact_reveals INT DEFAULT 5`.
- `get_entitlements()` → `limits.contactReveals` / `usage.contactReveals`.
- New endpoint `POST /api/businesses/[username]/reveal-contact`:
  `requireFeature`-style check → if under 5 (or Pro), insert the reveal row
  (atomic, advisory lock keyed on creator) and return the contact block;
  else 402. Already-revealed businesses never re-charge.
- Business contact fields: add `contact_phone`, `contact_email`, `contact_name`
  to `business_profiles` (nullable), collected in business edit-profile, only
  ever returned through the reveal endpoint.
- UI: on the business public profile / inside a conversation, a "Show contact
  details" button → reveal sheet with "3 of 5 free reveals used" footnote →
  Pro prompt at the cap.

**Open Q (see §10):** is the unit *the business's contact card* (my model), or
literally "5 business owners' profiles viewed" regardless of contact? The
former is defensible as a paid feature; the latter punishes browsing.

Commits:
- `feat(db): business contact fields + reveal ledger + entitlement (migration 138)`
- `feat(api): reveal-contact endpoint, gated at 5`
- `feat(web): business contact reveal sheet`
- `feat(mobile): business contact reveal sheet`

---

## 3. Pin chat — 3

**Status: does not exist.** ("Pinned" in `messages.tsx` refers to the
non-scrolling header, not chat pinning.) Chat is GetStream; the Postgres
`conversations` table is pre-Stream history + metadata.

**Proposed design:**

- Pinning is a **per-user** property of a conversation, so it belongs in
  Postgres, not Stream channel data (which is shared by both participants).
- New table `conversation_pins (user_id, conversation_id, pinned_at,
  PRIMARY KEY (user_id, conversation_id))`. RLS: own rows only, and a
  `WITH CHECK` that the user is actually a participant of that conversation.
- Free cap **3**, Pro unlimited. Enforce with a `BEFORE INSERT` trigger
  (`enforce_pin_quota()`, advisory lock on `user_id`) reading
  `billing_settings.free_pinned_chats INT DEFAULT 3` — consistent with the
  project/campaign pattern, and a standing count (not metered) so a trigger is
  the right tool.
- `get_entitlements()` → `limits.pinnedChats` / `usage.pinnedChats`.
- `GET /api/conversations` joins the caller's pins; response gains
  `pinned: boolean` per row. New `PATCH /api/conversations/[id]/pin`
  `{ pinned: true|false }` → 402 when inserting over the cap.
- Web + mobile inbox: pinned conversations render in a "Pinned" group above the
  list (mobile already has the visual slot); long-press / swipe / overflow-menu
  → "Pin". At the cap, the action shows "Free plan pins up to 3 chats — unpin one
  or go Pro."

**Open Q:** is pinning itself Free (cap 3) with Pro = unlimited (my assumption),
or is pinning entirely a Pro feature? The founder's phrasing ("3 chats can be
pinned in the top") reads as *3 = the free allowance*.

Commits:
- `feat(db): conversation_pins table + pin quota (migration 139)`
- `feat(api): conversation pin/unpin endpoint + pinned flag on list`
- `feat(web): pinned chats group + pin control`
- `feat(mobile): pinned chats group + pin control`

---

## 4. More than one connected account — Pro

**Status: single handle per platform. Biggest / most ambiguous feature.**

Today `influencer_profiles` has one column per platform (`instagram_handle`,
`twitter_handle`, `snapchat_handle`, …). Ownership is proven per (user,
platform, handle) via the bio-code handshake (migration 058/111). Metrics are
scraped per handle into `social_snapshots`.

The founder wants: a creator with several accounts on one platform can **connect
additional accounts** (long-press the platform icon on their profile → account
list → "Add account" / switch), and **switching should be quick from anywhere**.
This is a **Pro** feature.

**Two possible scopes — this needs a decision (§10):**

- **A — Extra connected handles (smaller).** Keep one *primary* handle per
  platform (what the public profile and search use). Pro unlocks connecting
  *secondary* handles on the same platform, each independently
  ownership-verified and scraped, shown as a switchable set on the creator's own
  profile/edit screen. "Switching" = choosing which one is primary / which one a
  given campaign or portfolio item is attributed to. No second identity, no
  second inbox.
- **B — Multiple creator identities / profile switcher (large).** The account
  can hold N creator profiles and switch the whole app context between them
  (separate portfolios, separate public URLs, separate stats). This is a
  weeks-long change touching auth, RLS on nearly every table, mobile nav, Stream
  identity. **Recommend against for this release.**

Assuming **A**:

- New table `connected_social_accounts (id, user_id, platform, handle,
  is_primary, ownership_claim_id, created_at)` — migrate the existing single
  columns into it as `is_primary = true` rows; keep the old columns as a
  generated/synced mirror for the RPCs that still read them (027/046/111) to
  avoid a big-bang RPC rewrite.
- `billing_settings.free_connected_accounts_per_platform INT DEFAULT 1`.
- `GATED_FEATURE` `social.multiaccount` (hard gate, Pro-only).
- `POST /api/social/accounts` (add) — `requireFeature('social.multiaccount')`
  → then the existing ownership-claim flow; `PATCH .../primary`; `DELETE`.
- Web: profile edit — per platform, a list of connected handles with "Make
  primary" + "Add account" (Pro-locked with a lock badge on Free).
- Mobile: long-press the platform chip on `(tabs)/profile.tsx` → action sheet
  with the connected set + "Add account". A global quick-switch (primary
  account) in the profile tab header.

**Reality check:** scraping N accounts multiplies Apify cost per creator, and
Apify is on the free tier with known stub behaviour for some actors
(`apify-plan-limits` memory). Confirm budget before enabling scraping for
secondary accounts — or scrape secondaries on a slower cadence.

Commits (scope A):
- `feat(db): connected_social_accounts table + backfill + entitlement (migration 140)`
- `feat(core): social.multiaccount gated feature`
- `feat(api): connected social accounts CRUD, Pro-gated`
- `feat(web): multi-account manager in profile edit`
- `feat(mobile): multi-account sheet + quick switch`

---

## 5. Who viewed your profile — limited list

**Status: data exists, no viewer list screen. Gate = show fewer viewers.**

`creator_profile_views (creator_id, business_id, view_count, first/last_viewed_at)`
has per-viewer identity with a creator-only read policy (migration 018/075).
`GET /api/home` already surfaces a 60-day *count* and an attention sparkline —
but there is no "here is *who*" list.

**Proposed design:**

- New `GET /api/profile/viewers` → returns viewer businesses ordered by
  `last_viewed_at` desc, each with name/avatar/handle (joined from
  `business_profiles`).
- **Free** sees the **most recent 5** distinct viewers + the total count
  ("and 23 others"). **Pro** sees the full list + dates + repeat-view counts.
- Implemented as a `canSee('profile.viewers')` read gate — free response is
  literally sliced to 5 and the tail replaced with a count; no 402, the screen
  still renders (this is the "return less data" rule from `lib/entitlements.ts`).
- `billing_settings.free_profile_viewers INT DEFAULT 5` so the number is tunable.
- Web: a "Who viewed your profile" card on `/dashboard/home` (or profile) → full
  screen list; blurred/locked rows beyond 5 on Free with a Pro CTA.
- Mobile: same card on `(tabs)/home.tsx` → `/profile/viewers` screen.

Commits:
- `feat(db): free_profile_viewers setting + entitlement key (migration 141)`
- `feat(api): profile viewers endpoint with free/pro projection`
- `feat(web): who-viewed-your-profile card + list`
- `feat(mobile): who-viewed-your-profile card + list`

---

## 6. Portfolio — 5

**Status: built with a flat cap of 24. Needs to become tier-aware.**

`creator_portfolio_items` has a hard 24-item cap enforced by a trigger
(surfaced as error `23514` / "Portfolio is full" in `/api/portfolio`).
Platform-derived entries (completed Influnet projects) are *not* rows here —
they're derived live and don't count.

**Proposed design:**

- `billing_settings.free_portfolio_items INT DEFAULT 5`; keep an absolute Pro
  ceiling (`pro_portfolio_items INT DEFAULT 24`, or NULL for unlimited — §10).
- Replace the fixed-24 trigger with `enforce_portfolio_quota()` that reads the
  caller's tier (advisory lock on `user_id`): Free → 5, Pro → 24/NULL.
- `get_entitlements()` → `limits.portfolioItems` / `usage.portfolioItems`
  (`usage` = `COUNT(*)` of manual items).
- `/api/portfolio` POST: catch the new exception → 402 with
  "Free portfolios hold 5 items. Upgrade to add more."
- Web + mobile portfolio editor: "3 of 5" counter; "Add" disabled with Pro CTA
  at the cap. `apps/mobile/app/portfolio/add.tsx` already exists.

Commit:
- `feat(db): tier-aware portfolio cap (migration 142)`
- `feat(api,web,mobile): portfolio quota UI + paywall`

---

## 7. Invoices — 10

**Status: invoicing built (migration 124/135), no generation cap.**

`project_documents` (kind `proforma` | `receipt` | `tax_invoice`) with gapless
per-series numbering (`allocate_invoice_number()`). Issued by the route with the
service role. No per-user quota.

**Proposed design:**

- The billable unit is a **tax invoice / proforma the creator generates**
  (receipts are automatic payment records — probably shouldn't count; §10).
- **Free: 10 documents per month**, metered via `consume_quota` with a new
  `invoices_month` meter + `billing_settings.free_invoices_per_month INT DEFAULT 10`.
  Monthly (not lifetime) because invoicing recurs with real business activity —
  a lifetime 10 would make the feature unusable within weeks for an active
  creator, which isn't the intent of a *limit*, it's a wall.
- `requireQuota(auth, 'invoices.generate', 'invoices_month', msg)` at the top of
  the invoice-generation route; `releaseQuota` if numbering/write fails after
  consume.
- `GATED_FEATURE` `invoices.generate` (metered, held by both tiers).
- `get_entitlements()` → `limits.invoicesPerMonth` / `usage.invoicesThisMonth`.
- Web + mobile: on the project documents screen, "7 of 10 invoices this month";
  at 10, the generate button → Pro prompt.

Commits:
- `feat(db): invoice monthly quota (migration 143)`
- `feat(core): invoices.generate metered feature`
- `feat(api): gate invoice generation at 10/month`
- `feat(web,mobile): invoice quota surface`

---

## 8. Creator → creator collaboration requests — 10

**Status: does not exist. `POST /api/collabs` is `role: 'business_owner'` only.**
New product surface: influencer-to-influencer outreach.

**Proposed design:**

- Allow `role: 'influencer'` to `POST /api/collabs` when `to_user_id` is another
  influencer (or a dedicated `POST /api/collabs/peer` to keep the brand path
  untouched and the notification copy distinct). Reuses `collab_requests`
  (`from_user_id` / `to_user_id` are already role-agnostic) and the accept flow.
- Receiving side: creators need an incoming-peer-request view + accept/decline.
  Check whether the existing requests screen already renders rows where
  `to_user_id = me` regardless of sender role (the GET does `.or(from,to)`),
  then it's mostly copy + an entry point ("Invite a creator" from another
  creator's public profile).
- **Free: 10 peer requests per month**, metered (`peer_requests_month` meter,
  `billing_settings.free_peer_requests_per_month INT DEFAULT 10`). Monthly, same
  reasoning as invoices.
- `GATED_FEATURE` `requests.peer` (metered).
- `notifyUser` copy: "{creator} wants to collaborate with you."
- Blocks (`enforce_blocks`, migration 076) and ownership gate apply the same as
  brand requests.

**Open Q:** is peer collaboration a real release-1 product direction, or a
speculative line item? It's the largest net-new *product* surface of the eight
(new outreach flow, new inbox category, abuse surface). If it's wanted, it may
deserve its own spec rather than riding this billing pass.

Commits (if greenlit):
- `feat(db): peer collab request quota (migration 144)`
- `feat(api): creator-to-creator collab requests, gated at 10/month`
- `feat(web): send + receive peer requests`
- `feat(mobile): send + receive peer requests`

---

## 9. Cross-cutting A — make Free visible (esp. mobile)

The founder's core complaint: *"the number-of-projects limit is implemented but
I can't see it anywhere… we're not showing that you're on a Free account, and
mobile doesn't surface it at all."*

**Web (partly there):**
- `plan-nudge` + `upgrade-card` exist but only on `/dashboard/billing` and
  `/dashboard/home`. Add a persistent **"Free" chip** in the dashboard sidebar
  (`components/dashboard/sidebar.tsx` already imports entitlement code) linking
  to `/dashboard/billing`, showing "Free" or "Pro".
- Add point-of-action counters everywhere a limit bites (project create,
  portfolio add, invoice generate, pin, contact reveal, peer request).

**Mobile (nothing there) — this is the big lift and a prerequisite for the
mobile half of every feature above:**
1. `feat(mobile): entitlements client` — `lib/use-entitlements.ts` mirroring web
   (fetch `GET /api/billing/entitlements`, cache, `isPro`, `can()`).
2. `feat(mobile): plan row in profile/settings` — "Influnet Free · Upgrade" row
   on `(tabs)/profile.tsx`, hidden when `subscriptionsEnabled = false`.
3. `feat(mobile): billing screen` — `app/billing.tsx`: Free-vs-Pro comparison
   (built from server `freeLimits`), usage meters, "Upgrade" → Razorpay
   (React Native checkout via WebView or `react-native-razorpay` — decision
   needed, §10) OR a "manage on web" deep link for v1.
4. `feat(mobile): PlanNudge component` — port the near/at-limit card.
5. `feat(mobile): paywall sheet` — a shared bottom sheet the gated actions call
   when they get a 402, with the feature label + "Upgrade".

Reusing the web `checkout` route from mobile is fine; the constraint is just
rendering the Razorpay UI. A **"manage your plan on the web" deep-link is an
acceptable v1** and unblocks everything else.

---

## 10. Cross-cutting B — re-engagement notifications

The founder: *"I open the app after many days and it never notified me it's been
a while — those kinds of notifications need to be done."*

**What exists:** `lib/notify.ts` → `notifications` row + Expo push, and the
`type: 'nudge'` value is *already defined* for exactly this. `profiles.expo_push_token`
is set on mobile launch. Push fan-out works today (used for stage changes etc.).

**What's missing:** a **scheduler**. There is no cron, no `pg_cron`, no
scheduled GitHub Action, no Supabase Edge Function on a timer. Nothing computes
"this user has been away N days" and fires anything.

**Proposed design:**

- New migration: `pg_cron` job **or** a Supabase Edge Function invoked by
  `cron.schedule` (Edge Function is easier to reason about and log). Runs daily
  ~10:00 IST.
- It computes, per user, `last_seen_at` (add `profiles.last_active_at`, bumped
  on any authenticated API hit via a cheap throttled update in `withAuth`, or
  derived from `get_user_activity`), and enqueues at most one nudge per user per
  window:
  - **Day 3 away** + has unread messages → "You have N unread messages."
  - **Day 3 away** + pending turn on a project → "A project is waiting on you."
  - **Day 7 away**, nothing pending → "N new campaigns since you were last here"
    (count from `campaigns` created since `last_active_at`), else a soft
    "Creators/brands you might like."
  - Hard stop after ~2 nudges with no return, so it never becomes spam.
- All via `notifyUser({ type: 'nudge', … })` — in-app card + push, **never
  email** (the code comment already says so; audit personas hard-bounce).
- Respect a new `profiles.nudges_opt_out BOOLEAN` + a settings toggle.
- Dedupe with a `notifications` lookup (no nudge if one was sent in the last
  72h).

**Infra note:** this is the one item that needs the founder to stand up a
scheduled runner (pg_cron extension enable, or an Edge Function + deploy step).
Per the "architect, don't implement infra" rule, the migration + function code
will be written but **enabling `pg_cron` / deploying the Edge Function is a
founder step** — documented in the commit and in `docs/operations`.

Commits:
- `feat(db): profiles.last_active_at + nudge opt-out (migration 145)`
- `feat(api): bump last_active_at in withAuth (throttled)`
- `feat(jobs): re-engagement nudge function + schedule (disabled until deployed)`
- `feat(web,mobile): nudge settings toggle`
- `docs(operations): how to enable the nudge scheduler`

---

## 11b. Progress (updated as commits land)

- [x] `docs(product)` — this plan
- [x] `feat(mobile): entitlements client` — use-entitlements store + endpoints
- [x] `feat(mobile): Pro upgrade` — /checkout/pro host page + billing screen +
      in-app Razorpay via openAuthSessionAsync + profile "Plan & billing" row
- [x] `feat(billing): project-conversion confirmation card` (§1) — web toast +
      mobile pop card, owner-only
- [x] `feat(db): billing_settings — remaining ceilings (migration 138)` — all
      7 columns + get_entitlements rewrite + core types + conversation_pins /
      business_contact_reveals tables
- [x] `feat(billing): portfolio cap — Free 5 / Pro 24 (migration 139)` (§6)
- [x] `feat(billing): pin conversations — Free 3 (migration 140)` (§3)
- [x] `feat(billing): who viewed your profile` — Free 5 / Pro all (§5); read
      gate, web `/dashboard/profile-viewers` + mobile `/profile-viewers`
- [x] `feat(billing): invoice generation — Free 10/month (§7)` — migration
      generalised `requireQuota` over MONTHLY_METERS; receipts exempt
- [x] `feat(billing): business contact reveal — Free 5 lifetime (§2, migration
      141)` — contact_* columns + atomic reveal RPC + web/mobile reveal UI
- [x] `feat(billing): creator→creator collab requests — Free 10/month (§8)` —
      /api/collabs/peer, shared receive/accept, sender-role-aware copy
- [x] `feat(notifications): re-engagement nudges (§10)` — migration 142 +
      /api/cron/nudges + workflow + opt-out; SCHEDULER IS A FOUNDER STEP
      (secrets + env var), see docs/operations/REENGAGEMENT_NUDGES.md
- [ ] **multi-account (scope A) — Pro (§4)** — the one remaining. Largest and
      riskiest: replaces the single-handle-per-platform column model. Needs its
      own focused pass — see §13 below.
- [x] web sidebar Free/Pro chip — ALREADY EXISTED (sidebar.tsx FooterLink)

## 13. Multi-account (§4) — remaining work, spelled out

Not started. Scope A confirmed (extra ownership-verified handles per platform,
switch which is primary; NOT a profile switcher). Why it's held back: every
public-profile RPC (027, 046, 111, 134, …) and search path reads
`influencer_profiles.instagram_handle` / `youtube_handle` / … directly. A new
`connected_social_accounts` table has to keep those columns in sync (as the
`is_primary` row) or rewrite ~8 RPCs — that decision wants care, not a rushed
commit at the end of a long session.

Planned commits:
1. `feat(db): connected_social_accounts (migration 143)` — table, backfill the
   existing single columns as `is_primary=true` rows, a trigger that mirrors the
   primary row back to `influencer_profiles.<platform>_handle` so the existing
   RPCs keep working untouched. `free_connected_accounts` (migration 138) already
   exists.
2. `feat(core): social.multiaccount` — already in GATED_FEATURES (migration 138
   commit); wire `hasFeature` so it's Pro-only (already is — not in the free set).
3. `feat(api): connected social accounts CRUD` — `POST /api/social/accounts`
   (requireFeature('social.multiaccount') → existing ownership-claim flow),
   `PATCH .../primary`, `DELETE`. Free can still manage its 1 per platform.
4. `feat(web): multi-account manager in settings` — per platform, list of
   connected handles, "Make primary", "Add account" (Pro-locked on Free).
5. `feat(mobile): multi-account sheet` — long-press the platform chip on the
   profile tab → connected set + "Add account"; primary quick-switch.

Open sub-decision still standing: scrape secondary accounts on the normal
cadence (Apify cost × N) or slower.

## 11. Recommended commit order

Phase 1 — spine & visibility (unblocks everything, low risk):
1. `feat(mobile): entitlements client + plan row + paywall sheet`
2. `feat(mobile): billing screen (web deep-link for checkout v1)`
3. `feat(web): persistent Free/Pro chip in sidebar`
4. `feat(web,mobile): project-quota confirmation card` (§1)

Phase 2 — the standing-count limits (same trigger pattern, cheap):
5. Portfolio → 5 (§6)
6. Pin chat → 3 (§3)
7. Who-viewed list → 5 (§5)

Phase 3 — metered limits:
8. Invoices → 10/month (§7)
9. Business contact reveal → 5 (§2)

Phase 4 — larger / needs decisions:
10. Multi-account (scope A) → Pro (§4)
11. Peer collab requests → 10/month (§8) *(only if greenlit as a product)*

Phase 5 — re-engagement:
12. Nudge scheduler (§10)

Each numbered item is 1–5 commits as listed in its section. Migrations are
numbered 138+ in this order. **Nothing pushed** — founder reviews, then pushes
`dev` and (separately) rolls the 115→14x migration chain to staging.

---

## 12. Decisions (founder, 2026-08-31)

- **Sequence:** full plan, phased order (§11), one commit at a time, **no push** —
  founder reviews, pushes `dev`, and rolls the 115→14x migration chain to staging.
- **Feature 4:** Scope A (extra ownership-verified handles, switch primary).
- **Feature 8:** build now, 10 peer requests / month.
- **Mobile checkout:** Razorpay in-app (native), not a web deep-link.
- Remaining table rows below take their listed defaults unless the founder says
  otherwise during review.

### Still-open (defaulted)

| # | Question | Default if no answer |
|---|---|---|
| 2 | Contact reveal unit: the **business's contact card** (rewardable) or literally **any 5 business profiles viewed**? | Contact card |
| 3 | Is pinning **Free (3) + Pro unlimited**, or **Pro-only**? | Free 3 / Pro unlimited |
| 4 | Multi-account: **scope A** (extra verified handles, switch primary) or **scope B** (full profile switcher)? | Scope A |
| 4 | Scrape secondary accounts on the normal cadence (Apify cost) or slower? | Slower cadence |
| 6 | Pro portfolio ceiling: **24** (current absolute) or **unlimited**? | 24 |
| 7 | Do **receipts** count toward the invoice cap, or only proformas/tax invoices? | Only proforma + tax invoice |
| 7/8 | Invoice & peer-request caps: **per month** (my rec) or **lifetime**? | Per month |
| 8 | Is **creator→creator collaboration** a real R1 product, or defer? | Defer to its own spec |
| 9 | Mobile checkout: **Razorpay in-app** now, or **"manage on web" deep-link** for v1? | Deep-link v1 |
| 10 | Nudge cadence day-3 / day-7 acceptable? Opt-out on by default? | As written, opt-out available |
| — | Rollout: keep new limits **dev-only** like 115–131, or push the whole chain to staging as part of this? | Dev-only, founder rolls staging |
