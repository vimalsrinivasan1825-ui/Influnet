# Ownership Verification — Discoverability & Business Trust Signals

**Date:** 2026-07-28
**Status:** Implemented (web + mobile) — migrations 084/085 unapplied on hosted DB
**Supersedes:** the external "Bio Link Ownership Verification & Business Safety Disclaimer" plan
**Canonical reference:** `docs/product/PROJECTS_AND_VERIFICATION.md` §2.12 (threat model)

## Implementation notes (2026-07-28)

All of B0/B1/B2/B3/A1/A2/A3 shipped in one pass, web and mobile together. Deviations
from the plan as written, discovered during implementation:

- **B0 needed a second grant, not just the RPC replace.** `search_influencers()` is
  `SECURITY DEFINER` so it doesn't need one, but
  `apps/web/src/app/api/conversations/[id]/deal/route.ts` reads `profiles` through the
  authenticated (anon-key) client, which is bound by 048's column-level SELECT grant
  (`id, role, name, location, created_at, updated_at` — `verified_badge` was not in it).
  Adding `verified_badge` to that `.select()` without a grant would have failed the
  *whole query* silently — exactly the bug 078 already documented and fixed for two other
  columns. Migration 084 adds `GRANT SELECT (verified_badge) ON public.profiles TO
  authenticated` alongside the RPC replace. Safe: `get_public_influencer` (083) already
  exposes this value to anyone, logged in or not.
- **B1 verified live** against real hosted data (read-only, via service-role REST) for
  both states — `/c/christopher` (verified) and `/c/vimal2123` (unverified) — before and
  after confirms the neutral "OWNERSHIP NOT VERIFIED" pill renders correctly with no
  console errors, no regression to the verified tick.
- Everything else (nudge, requests/new banner, deal-panel banner, mobile creator/[id]
  badge, mobile conversation deal sheet) is typecheck-clean (`tsc --noEmit` zero errors
  on both apps) and mirrors already-proven patterns 1:1, but couldn't be click-tested
  live — no login credentials available in this session, and 084/085 are unapplied on
  hosted (confirmed live: `search_influencers` predates the column, and
  `profiles.ownership_nudge_dismissed_at` 42703s). Both degrade gracefully in the
  meantime via the same `'x' in p ? p.x : undefined` fallback `mediakit_nudge_dismissed_at`
  already uses.
- Migrations were **not applied** to the hosted DB — that stays a deliberate human step,
  consistent with 080-083.

### Follow-up round (same day, user feedback)

- **Disclaimer timing confirmed, not changed**: the `requests/new` banner (B2) was already
  non-blocking — `canSend`/the submit button's `disabled` only checks `submitting`, never
  `verified_badge`. A business sees the warning and can still send the request. This was
  already correct; no code change needed, just verified and reported back.
- **Fixed a real bug found while reviewing**: `apps/web/public/influet_logo.png` (the shared
  logo used by ~10 pages) was 1536×1024 with the actual mark occupying only 42%×68% of the
  frame, surrounded by transparent padding. Rendered into any of the app's ~28-48px square
  logo slots via `objectFit:contain`, the visible mark shrank to a barely-there smudge —
  this is almost certainly the "can't see the logo" the user reported. Cropped the source
  tightly to the mark (816×816, alpha-based bbox detection, not a solid white background as
  it first appeared — `Read`-tool PNG previews composite transparency onto white). One
  consumer (`apps/web/src/app/b/[username]/page.tsx`) had a mismatched non-square
  `width={80} height={28}` box that would have stretched/distorted the now-square asset;
  corrected to `28×28` to match every other usage. Verified live via a cache-busted
  `fetch()` (`96×96`, not the old `96×64`) — the browser's own HTTP cache made repeated
  `naturalWidth` checks on the same tab misleadingly report the stale size.
- **Verified badge redesigned for visual distinctiveness**, per explicit feedback that it
  blended in with ordinary UI (the app's brand accent is already purple/pink depending on
  role-theme, and the badge previously reused the generic "success" green / `info` blue used
  for unrelated positive states elsewhere). New fixed, role-independent brand pink
  (`#FF0B8D`, sampled directly from the logo mark — see script output) applied everywhere
  the badge renders:
  - `packages/tokens/src/index.ts` — new `verified`/`verifiedSoft` palette entries, deliberately
    separate from `accents` (which recolors per role/theme; verified must not).
  - Mobile `components/ui/badge.tsx` — new `verified` tone; `VerifiedBadge` (previously
    `info`/blue) recolored to match.
  - Web `components/ui/badge.tsx` — new `verified` variant, used in `deal-panel.tsx` and
    `requests/new/page.tsx` (replacing `variant="success"`).
  - `creator-profile.module.css` — `.eyebrow` and `.vtick` switched from the page's generic
    `--accent` purple to dedicated `--verified`/`--verified-soft` custom properties (with a
    dark-mode-adjusted soft tint); icon switched from a star glyph to the same checkmark
    used in `.vtick`, for one consistent "verified = checkmark" visual language across the
    whole app instead of two different glyphs.
- Confirmed no database writes occurred this session — every Supabase call made was a
  read (`curl` GETs, RPC reads) used only to find real test data (a verified and an
  unverified username) for live verification. Migrations 084/085 exist only as files in
  `supabase/migrations/`; nothing has been applied to the hosted DB.

---

## 1. Premise: the engine is built, the funnel is not

Influnet already has a complete, server-proved Instagram ownership handshake. Nothing in
this plan changes it.

| Layer | Where it lives |
|---|---|
| Claim table, RLS, `initiate_social_claim` / `confirm_social_claim` | `supabase/migrations/058_social_account_ownership.sql` |
| Issue code / scrape live bio / confirm, TTL + attempt caps + cooldown | `apps/web/src/app/api/verification/ownership/route.ts` |
| Verify landing page | `apps/web/src/app/vf/[code]` |
| Web claim UI | `apps/web/src/components/dashboard/instagram-ownership-panel.tsx` |
| Mobile claim UI (3-state, copy → Instagram → confirm) | `apps/mobile/app/verification.tsx` |
| Ownership gates creator auto-verify | `apps/web/src/lib/verification.ts:133` |
| Ownership signal wired into scoring | `apps/web/src/app/api/verification/route.ts:142` |
| Badge derived only from the real pipeline | `supabase/migrations/083_influencer_verified_badge_lockdown.sql` |

**The actual problem is reach and payoff:**

1. On web, the panel is mounted in exactly one place —
   `apps/web/src/app/dashboard/settings/page.tsx:374`. A creator can finish signup and
   never learn verification exists. `influencer-home.tsx` renders only `MediaKitNudge`.
2. On the public profile, an unverified creator renders as plain "Creator"
   (`creator-profile-view.tsx:307`) — absence of a badge reads as *"not checked yet"*,
   not *"ownership unproven"*.
3. At the point money is committed — `dashboard/requests/new` and `deal-panel.tsx` —
   verification state is not surfaced at all. `deal-panel.tsx` has zero references to it.
4. Mobile is already ahead: `(tabs)/home.tsx:248` and `(tabs)/profile.tsx:336` both nudge
   into `/verification`. Web should reach parity, not the other way round.

So: build the nudge layer and the business-facing trust signal. Do not rebuild the engine.

### 1.1 Mobile parity check (added 2026-07-28, after initial review)

Audited every mobile screen against its web counterpart before scoping work. Findings:

- **Mobile is already AHEAD on the creator nudge (Workstream A).** `(tabs)/home.tsx:238-248`
  and `(tabs)/profile.tsx:336,362` already nudge into `/verification` when
  `!home.profile.verified`. `apps/mobile/app/verification.tsx` is a complete 3-state claim
  flow reading real status from `GET /api/verification/ownership` via
  `endpoints.checkOwnershipStatus()`. **Web should copy mobile's pattern, not the other way
  round.** No mobile work needed for Workstream A.
- **Mobile has real equivalents for every Workstream B surface**, so parity work is
  mandatory there too, not optional:
  - `apps/web/src/components/public-profile/creator-profile-view.tsx` (public `/c/[username]`)
    ↔ `apps/mobile/app/creator/[id].tsx` (the business-side creator detail screen — the
    *only* screen mobile has for viewing a creator before sending a request, since Discover
    is off).
  - `apps/web/src/app/dashboard/requests/new/page.tsx` (creator preview) ↔
    `apps/mobile/app/requests/new.tsx`. Mobile's version takes no `to`/`name` params beyond
    routing and does not re-fetch the creator — the only nav path into it is *from*
    `creator/[id].tsx`, which the user has always just seen. Putting the trust signal on
    `creator/[id].tsx` covers this for mobile; duplicating it in `requests/new.tsx` would be
    a redundant fetch for a screen reached zero other ways.
  - `apps/web/src/components/dashboard/deal-panel.tsx` ↔ the deal bar + "Deal terms" sheet
    in `apps/mobile/app/conversations/[id].tsx:390-420,528+`. Both are fed by the same
    `GET /api/conversations/[id]/deal` endpoint.
- **Workstream B4 (discover cards) is DROPPED, not deferred.** `apps/web/src/app/api/discover/route.ts`
  has Discover browsing hard-disabled ("temporarily disabled for V1 launch per client
  request"), and `apps/mobile/app/(tabs)/_layout.tsx:6-13` documents that mobile
  deliberately has no Discover tab so it doesn't get ahead of web on a flow "the product
  doesn't stand behind." There is no discover grid on either platform to add a badge to.
- **Real backend gap found, correcting §3 below:** the single RPC that backs both of the
  above business-side surfaces — `search_influencers()` (`supabase/migrations/048_security_and_search.sql`,
  called via `/api/discover?id=`) — does not select `verified_badge` at all. Neither does
  the `partner` lookup in `/api/conversations/[id]/deal/route.ts:49`
  (`.select('id, name, role')`). Both need a column added before any UI can render the
  signal. This means Workstream B is **not** a zero-migration change as originally scoped —
  see the corrected sequencing in §5.

---

## 2. Rejected from the original plan (and why)

These are recorded so the ideas don't get re-proposed later.

### 2.1 REJECTED — permanent `influnet.com/c/[username]` bio link as a verification path

The original plan proposed matching a permanent public string in the bio, with a fallback
matching `influnet.com/c/` or even bare `influnet`. This is a security regression against
what migration 058 already does.

- **It severs the user↔handle binding.** Real creator A puts their Influnet link in their
  IG bio. Impersonator B signs up claiming handle A. The scraper reads A's live bio, finds
  an Influnet string, and awards B ownership of A's handle. Migration 058's single-use,
  high-entropy code bound to `(user, platform, handle)` exists precisely to stop this.
- **A permanent public link is not a secret.** Anyone can read it off A's profile and
  reuse it; a one-time expiring code cannot be replayed.
- **It drops the global uniqueness guarantee.** `social_claims_verified_unique_uidx` (058)
  enforces at most one verified owner per `(platform, handle)`. The proposal has no
  equivalent.

*If we want creators linking `influnet.com/c/[username]` in their bios, ship it as a
growth/backlink feature with **zero** trust weight. It must never feed `ownership_verified`.*

### 2.2 REJECTED — `social-snapshot.ts` writing `verified_badge = true` on detection

`profiles.verified_badge` is derived from `profiles.verification_status` by the
`sync_verified_badge` trigger (055). Migration 083 exists specifically because a badge was
once settable outside that pipeline. Any new badge write must go through
`submit_verification` / `admin_decide_verification`.

Also: ownership proof ≠ trust badge. Ownership is *one signal* consumed by `decide()`
alongside follower reality, recency, and fraud flags.

### 2.3 Corrections to file references

The original plan targeted `apps/web/src/components/dashboard/deal-request-modal.tsx`,
which does not exist. The real surfaces are `deal-panel.tsx` and
`apps/web/src/app/dashboard/requests/new/page.tsx`. It also conflated
`profiles.verified_badge` with the legacy `influencer_profiles.is_verified` column that
083 removed from the public read path.

---

## 3. Scope

Three workstreams, independently shippable, in priority order.

### Workstream A — Web creator nudge (parity with mobile)

**Goal:** an unverified creator meets the ownership prompt on their dashboard home, not
buried in Settings.

#### A1. `[NEW]` `apps/web/src/components/dashboard/verify-ownership-nudge.tsx`

Model it directly on `media-kit-nudge.tsx` — same self-fetching, dismiss-safe pattern:

- Self-fetches `/api/profile`; renders nothing unless `role === 'influencer'`.
- Starts in the dismissed state so there is no flash before real state is known
  (`media-kit-nudge.tsx:46-48` explains why).
- Hidden when the creator is already verified.
- Copy: *"Verify your Instagram — verified creators get more requests. Takes about a
  minute."* (matches the mobile string at `(tabs)/home.tsx:244` so both platforms read the
  same.)
- CTA links to the existing panel. Deep-link it: `/dashboard/settings#instagram-ownership`,
  and add that `id` to the panel's wrapper in `settings/page.tsx` so the link lands on it.
- Dismiss posts to the new endpoint in A3, with the same `localStorage` fallback
  `media-kit-nudge.tsx` uses while the migration is unapplied.

**Nudge state source.** The nudge needs to distinguish *"never started"* from *"code
issued, not confirmed"* — those want different copy ("Verify your Instagram" vs "Finish
verifying — your code is still active"). `/api/verification/ownership` already exposes
this via `GET ?platform=instagram&handle=…`, returning `{ status, verified_at }`. Call it
with the profile's `instagram_handle`; skip the nudge entirely when there is no handle.

#### A2. `[MODIFY]` `apps/web/src/components/dashboard/views/influencer-home.tsx`

- Render `<VerifyOwnershipNudge />` next to `<MediaKitNudge />` behind the same
  `!welcomeOpen` gate (line 41).
- **Show at most one nudge at a time.** The existing comment at lines 33-36 is explicit
  that first impressions shouldn't be two competing asks. Ownership takes precedence over
  the media-kit nudge — it gates auto-verification and brand trust, the media kit doesn't.
  Implement as: if the ownership nudge will render, `MediaKitNudge` does not.

#### A3. Persistence

- `[NEW]` `supabase/migrations/084_ownership_nudge_dismissed.sql` — add
  `profiles.ownership_nudge_dismissed_at TIMESTAMPTZ` and
  `GRANT UPDATE (ownership_nudge_dismissed_at) ON public.profiles TO authenticated`.
  Copy 077 verbatim in structure, including its comment explaining why this column is safe
  to add to 070's allow-list (self-service, carries no privilege).
- `[NEW]` `apps/web/src/app/api/profile/ownership-nudge/route.ts` — mirror
  `api/profile/mediakit-nudge/route.ts`.
- `[MODIFY]` `apps/web/src/app/api/profile/route.ts` — include
  `ownership_nudge_dismissed_at` in the returned profile.

**Re-nudge cadence.** Unlike the media kit, this is a one-time dismissal we *should*
revive: dismissed-forever leaves creators permanently unverified. Treat the timestamp as a
snooze — re-show once it is older than 7 days, while `status !== 'verified'`. Keep the
comparison in the component so no further server work is needed.

#### A4. `[MODIFY]` `apps/web/src/components/dashboard/views/types.ts`

`InfluencerHomeData.profile` (lines 4-21) has `is_verified` but no ownership state. Not
strictly required — the nudge self-fetches — but if we later move this into the dashboard
payload, add `ownership_status?: 'none' | 'pending' | 'verified'` here, optional, with the
same "undefined when migration unapplied" comment convention used for `welcome_seen`.

---

### Workstream B — Business-facing trust signal

**Goal:** a brand knows, before committing money, whether this creator proved they own the
handle. Web and mobile ship together — mobile has a real surface for every step below (see
§1.1), so this is not a web-only workstream.

Two states only. Do not invent a third — "pending" is not a trust state to a brand.

| State | Public profile / creator detail | Request / deal surfaces |
|---|---|---|
| `verified_badge = true` | existing tick + "Verified creator" (unchanged) | green confirmation line |
| otherwise | explicit "Ownership not verified" chip | amber disclaimer |

#### B0. `[NEW]` backend — required before any UI in this workstream can render real data

- **`supabase/migrations/084_search_influencers_verified_badge.sql`** — `CREATE OR REPLACE
  FUNCTION public.search_influencers(...)` (originally 048), adding
  `'verified_badge', coalesce(p.verified_badge, false)` to the `jsonb_build_object` at
  `048_security_and_search.sql:72-82`. `profiles p` is already joined (line 84) — no new
  join needed. This single RPC backs both `/api/discover?id=` (web B2, mobile B1) and full
  discover search if it's ever re-enabled.
- **`[MODIFY]` `apps/web/src/app/api/conversations/[id]/deal/route.ts:49`** — change
  `.select('id, name, role')` to `.select('id, name, role, verified_badge')` on the
  `partner` lookup. Feeds both web B3 (`deal-panel.tsx`) and mobile B3
  (`conversations/[id].tsx`) since both call this same endpoint.

#### B1. Public/creator-detail view — web + mobile

**`[MODIFY]` `apps/web/src/components/public-profile/creator-profile-view.tsx`**

At the eyebrow (line ~307), replace the silent `'Creator'` fallback with an explicit
neutral-but-honest state. Suggested copy:

> **Ownership not verified** — this creator hasn't confirmed they control the linked
> social accounts.

Tone matters: this is a public page the creator controls and shares. It must read as *"not
yet done"*, not as an accusation. Neutral grey/amber chip, not red; no scare iconography.
Source it from `data.isVerified`, which 083 already routes through the real pipeline via
`get_public_influencer` — no new query needed here, B0 doesn't touch this path.

**`[MODIFY]` `apps/mobile/app/creator/[id].tsx`**

This is mobile's only pre-request view of a creator (see §1.1) — the direct equivalent of
the web page above, not of B2. Add `verified_badge: boolean` to the `CreatorResult`
interface (line ~21-30) and render a `Badge` alongside the existing `availability_status`
badge (line ~69-82): `tone="ok"` + "Verified creator" when true, a neutral/warn tone +
"Ownership not verified" when false. Depends on B0.

#### B2. Request-preview — web only

**`[MODIFY]` `apps/web/src/app/dashboard/requests/new/page.tsx`**

The creator preview block (lines 15-20, 192-205) already renders name, username, headline
from `/api/discover?id=` (line 79). Add `verified_badge?: boolean` to `CreatorPreview` and
the inline fetch type, and render:

- Verified: `✓ Verified creator — ownership of @handle confirmed by Influnet.`
- Unverified: amber banner —
  > **Ownership not verified.** This creator hasn't confirmed they control the social
  > accounts on their profile. Double-check the handle before sending a paid request.

No mobile equivalent needed — per §1.1, `requests/new.tsx` on mobile is only reached from
`creator/[id].tsx` (B1), which already carries the signal.

#### B3. Deal terms — web + mobile

**`[MODIFY]` `apps/web/src/components/dashboard/deal-panel.tsx`**

`DealState.partner` (line 54) currently types `{ id, name?, role?, slug? }`. Add
`verified_badge?: boolean | null`. Render the two-state line directly after the existing
brand-profile-slug link (lines 280-287), gated on `partner?.role === "influencer"` — the
same condition naturally means only a business viewer ever sees it, since `partner` is
always *the other side* of the conversation. Depends on B0.

**`[MODIFY]` `apps/mobile/app/conversations/[id].tsx`**

Add `partner?: { id: string; name?: string | null; role?: string | null; verified_badge?:
boolean | null } | null` to `DealPayload` (line ~34). Capture it in `load()` (line
292-306) into new state alongside the existing `deal` (`DealSummary`) state — don't fold it
into `summariseDeal()`, which is deliberately scoped to deal status only (see its docstring
at line 148-151). Render the same two-state line in the `Sheet` at line 528+, gated the
same way as web. Depends on B0.

#### B4. Discover cards — DROPPED

See §1.1. Discover is intentionally disabled on both platforms; there is no browse grid to
touch on either.

---

### Workstream C — Ownership re-affirmation (optional, ship last)

Ownership is proven once and never re-checked. A handle can be sold, renamed, or
abandoned.

- `[MODIFY]` `apps/web/src/lib/social-snapshot.ts` — during the existing background
  refresh, when a creator has a verified claim, record whether the handle still resolves
  and still belongs to the same account.
- **Constraint:** this may only *emit a signal*. It routes through the verification
  pipeline (`submit_verification`) so `sync_verified_badge` remains the only writer of
  `verified_badge`. It must never write the badge directly — see §2.2.
- Prefer downgrading to `in_review` over auto-revoking. The existing scorer's rule holds:
  never auto-reject, escalate to a human.

---

## 4. Verification plan

### Automated

- Unit tests for the nudge state machine: no handle → no nudge; `status: 'none'` → start
  copy; `'pending'` → finish copy; `'verified'` → nothing; dismissed <7d → nothing;
  dismissed >7d → re-shown.
- Assert the mutual exclusion in A2: ownership nudge and media-kit nudge never both render.
- `npm test` in `apps/web` — the existing 11-assertion 083 test and the ownership tests in
  `tests/unit/verification.test.ts` must stay green. No test in this plan should require
  changing them; if one does, the change has leaked into the engine.

### Manual

1. Unverified creator with a handle → nudge on `/dashboard`; CTA lands on the ownership
   panel in Settings (anchor scroll works).
2. Dismiss → gone on reload and on a second browser (proves the column, not localStorage).
3. Run the real bio-code flow end to end → nudge disappears, badge appears.
4. As a business: verified creator shows the green line on `/c/[username]`,
   `requests/new`, and the deal panel; unverified shows the amber disclaimer on all three.
5. Confirm no regression to `/c/[username]` for creators verified through the admin path.

### Migration gate

Migrations **080-083 are unapplied on the hosted DB**. 084 lands behind them. Workstream A
must degrade cleanly when 084 is missing — same `!== undefined` guard
`media-kit-nudge.tsx:57-61` uses — so web can ship ahead of the migration window.

---

## 5. Sequencing

Corrected from the original draft: B0 is real backend work (one migration, one route
change), not "no DB." A3's migration is renumbered 085 since 084 is now taken by B0.

| Order | Workstream | Rationale |
|---|---|---|
| 1 | B0 (084 + deal route select) | Everything in B1/B3 depends on this. Small, isolated, no RLS/grant changes — safe to land first. |
| 2 | B1 (web + mobile) + B2 (web) + B3 (web + mobile) | Pure UI once B0 is live. Ship web and mobile together — this is a parity workstream, not web-first. |
| 3 | A1 + A2 (web nudge, localStorage-only dismissal) | Mobile already has this (§1.1) — web catches up. Ships before the dismissal migration; degrades cleanly. |
| 4 | A3 + 085 (`ownership_nudge_dismissed_at`) | Account-level dismissal once the migration window opens (080-083 are still unapplied on hosted — see project memory). |
| 5 | C | Only after the funnel above is producing verified creators. |

Migrations 080-084 are unapplied on the hosted DB as of 2026-07-28 (see `hardening-status`
/ `verified-badge-lockdown` memory). 084 (B0) joins that queue; it does not block local
dev/staging work, only the hosted rollout.
