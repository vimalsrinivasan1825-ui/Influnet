# Mobile App — Build Stages & Verification

**Date:** 2026-07-20 · **Branch:** `feat/mobile-app`
**Companion docs:** [MOBILE_APP_PLAN.md](../architecture/MOBILE_APP_PLAN.md) (the design) · [apps/mobile/README.md](../../apps/mobile/README.md) (how to run it)

The step-by-step record of building the app: what each stage did, how it was
verified, and what's left. Stages 0–8 are **done and verified**; stages 9+ are
the remaining work in order.

---

## How to verify anything in this app

Three checks, cheapest first. Run all three before calling a stage done.

| Check | Command | Catches |
|---|---|---|
| **Types** | `cd apps/mobile && npm run typecheck` | Wrong API shapes, bad props, missing imports |
| **Bundle** | `npx expo export --platform ios` | Missing peer deps, bad Metro resolution, invalid route files — **the one that matters**, because typecheck can't see Metro |
| **Web regression** | `cd apps/web && npm run typecheck && npx vitest run && npm run build` | Anything the `packages/` extraction broke |

Bundling is the real gate. TypeScript is happy with imports Metro can't resolve —
every dependency problem in this build was caught by `expo export`, not by `tsc`.
Bundle for **both** platforms; they pull different files from expo-router.

---

## Completed stages

### Stage 0 — Extract shared packages ✅

Created `packages/{types,core,api,tokens}` and moved the pure-TS logic out of
`apps/web`. `git mv` preserved history; thin re-export shims were left at every
old path so no import in the web app changed.

| Moved | To |
|---|---|
| `src/types/index.ts` (601 lines) | `@influnet/types` |
| `validators.ts`, `project-lifecycle.ts`, `project-stage-guide.ts`, `constants.ts` | `@influnet/core` |
| Deal-state semantics (split out of `project-status.ts`) | `@influnet/core/deal-state` |
| `globals.css` custom properties, as TS | `@influnet/tokens` |
| `api-client.ts`, generalised | `@influnet/api` |

`project-status.ts` was **split, not moved**: the state machine is shared, the
Tailwind class strings stayed on web. Mobile has its own palette map in
`lib/deal-state-style.ts` keyed off the same `DealState`.

Also: added `transpilePackages` to `next.config.ts` (the packages ship raw TS).

**Verified:** web typecheck clean · 135 tests pass · production build compiles, 60 static pages generated.

### Stage 1 — Expo scaffold ✅

Expo SDK 57 / RN 0.86 / React 19, expo-router, monorepo-aware Metro config
(`watchFolders` at the repo root, both `nodeModulesPaths`,
`disableHierarchicalLookup` so React and Reanimated can't load twice).

**Verified:** a smoke-test screen importing `@influnet/core` and `@influnet/tokens` bundled — proving workspace resolution works before any screens existed. This caught `@expo/metro-runtime` and `expo-glass-effect` as missing peers.

### Stage 2 — Design system ✅

`components/ui/`: `Txt`/`Numeral`, `Button`, `Screen`/`ScreenScroll`/`Card`/`SectionCard`/`Divider`,
`Badge`/`VerifiedBadge`, `Avatar`, `ListRow`/`ListGroup`, `Field`, `Chip`/`ChipWrap`/`ChipRail`,
`Skeleton`/`SkeletonCard`/`EmptyState`/`ErrorState`, `SegmentedControl`, `StatCard`/`StatGrid`,
`Sheet`/`StickyFooter`. Plus `lib/theme.tsx` (role-accent context), `lib/format.ts` (₹, Indian
numbering, relative time), `lib/use-fetch.ts` (load + refresh-on-focus + pull-to-refresh).

**Verified:** typecheck clean.

### Stage 3 — Auth & onboarding ✅

Welcome (role fork) · login · signup wizards for both roles · pending-approval screen ·
session gate. The web's long forms became one question per screen with a progress rail
and a sticky CTA. Live username availability reuses `/api/auth/check-username`.

**Verified:** typecheck clean.

### Stage 4 — Tabs & Home ✅

Role-resolved bottom tabs (creator gets Requests, business gets Discover), badge counts
polled off `/api/notifications/summary`. Home leads with an **action queue** — proposals
awaiting you, new requests, verification nudge — then stats, then in-flight projects.

**Verified:** typecheck clean. Endpoint helpers made generic here so screens type their payloads.

### Stage 5 — Discover, requests, connections ✅

Discover card feed with a filter sheet, quick-niche rail and cursor pagination ·
creator detail · request composer · incoming/sent requests with accept/decline sheets.

Accepting explains that it opens a **conversation**, not a project — matching the
2026-07-20 deal-flow model.

**Verified:** typecheck clean. Fixed: `updateCollabStatus` PATCHes the collection with `{id, status}`, not `/collabs/:id`; lucide dropped brand icons, so channels are labelled.

### Stage 6 — Messages & deals ✅

Conversation list · chat thread with bubbles and a composer · deal bar pinned above the
composer opening a terms sheet. Live updates via a Supabase Realtime subscription on
`messages` inserts — the API already owns that table, so no polling and no extra service.

**Verified:** typecheck clean.

### Stage 7 — Projects & the stage timeline ✅

Projects list bucketed **Your move / Waiting on them / Closed** · project detail with the
vertical `StageTimeline` · per-stage screen with instructions for both sides and a sticky
sign-off bar wired to the `signoff` / `revoke_signoff` / `propose_skip` actions.

The Kanban board is deliberately not ported. See the README for why.

**Verified:** typecheck clean.

### Stage 8 — Profile & the rest ✅

Profile home (share sheet hands out the web profile URL) · notifications (opening the
screen is the read receipt) · activity timeline · connections · settings · Instagram
verification (copy code → open Instagram → confirm).

**Verified:** typecheck clean · **iOS and Android production bundles both export** · web still typechecks, passes 135 tests, and builds.

---

## Remaining stages

### Stage 9 — Push notifications

The only stage that needs **backend work**.

1. Migration: `device_push_tokens (user_id, expo_push_token, platform, last_seen_at)`.
2. `POST /api/notifications/devices` to register and refresh tokens.
3. Fan-out where `lib/notify.ts` writes a notification → Expo Push API.
4. Client: `expo-notifications`, permission prompt after first sign-in, token registration, tap-to-deep-link.

**Verify:** two physical devices; sign off a stage on one and confirm the other gets a push that opens the right screen. Simulators can't receive push.

### Stage 10 — Payments

Razorpay RN SDK on `advance_payment` / `final_payment`. Keep it env-gated exactly like
`payment-gate.tsx` does on web, so a build without keys degrades to read-only rather than crashing.

**Verify:** Razorpay test keys, full advance→completion run, confirm `/api/payments/webhook` records the ledger row.

### Stage 11 — Uploads & stage items

`expo-image-picker` → existing `/api/uploads/sign` → Cloudinary. Wire into stage items and change requests.

**Verify:** upload from a device, confirm the asset appears for the counterparty.

### Stage 12 — Profile editing & reviews

Sectioned edit screens (basics, niches, rates). Review sheet on `project_completed`.

### Stage 13 — Deep links & auth callbacks

`influnet://` is registered in `app.json` but no handlers are wired. Needed for password
reset and email confirmation. Add the redirect URLs to Supabase's allowlist.

**Verify:** trigger a password reset, tap the emailed link, land on the new-password screen.

### Stage 14 — Ship

Maestro E2E mirroring [E2E_SYSTEM_FLOW_TEST.md](E2E_SYSTEM_FLOW_TEST.md) · Sentry via
`sentry-expo` · EAS Build profiles wired to the `APP_ENV` tiers · store assets · review submission.

**Blockers to start now** (lead time, not code):
- Apple Developer + Google Play accounts — Apple verification can take weeks, and push testing in Stage 9 needs APNs credentials.
- Confirm an account-deletion path exists. Settings currently routes deletion to support email; Apple accepts that, but the process has to actually work.
- Re-read the payments/IAP risk in the plan doc before Stage 10.

---

## Gotchas found while building

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to resolve @expo/metro-runtime` / `expo-glass-effect` / `@expo/ui` / `expo-symbols` | expo-router SDK 57 peers npm doesn't pull automatically | `npx expo install <module>`; iOS and Android need different ones |
| `Unable to resolve semver/functions/satisfies` | Root has semver **v6** (flat); Reanimated needs **v7**'s `functions/` dir, and `disableHierarchicalLookup` blocks the fallback | `npm install semver@^7 --workspace=mobile` |
| Endpoint helpers returned `unknown` | `createEndpoints` wasn't generic | Type parameter per helper: `endpoints.home<HomePayload>()` |
| `Instagram` / `Youtube` not exported from lucide | Brand marks removed from lucide | Use `AtSign` / `Link2` and label the channel |

**The pattern:** typecheck passing means nothing about whether the app runs.
Bundle both platforms every time.
