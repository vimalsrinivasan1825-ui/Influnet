# Implementation Progress — Projects & Verification Build

Companion to [product/PROJECTS_AND_VERIFICATION.md](./product/PROJECTS_AND_VERIFICATION.md).
Built as vertical slices: **schema → backend → UI → verify**. Each slice is verified with
`vitest` unit tests + `tsc --noEmit` typecheck + dev-server route compilation. Full
authenticated E2E and migration apply are **human-gated** (no local Docker/Supabase; `.env.local`
points at the hosted DB — I don't apply migrations to prod or create test users there).

---

## Slice A — Project Stage Pipeline (replaces freeform Kanban) ✅ code-complete

**What shipped**

| Layer | File | Change |
|---|---|---|
| Schema | `supabase/migrations/054_project_stage_items.sql` | New `project_stage_items` table (checklist/gates) + participant RLS mirroring `project_cards` |
| Lib (SoT) | `apps/web/src/lib/project-stage-items.ts` | Default checklist per stage, `buildDefaultStageItems`, `blockingItems`, `canAdvanceStage` |
| API | `apps/web/src/app/api/projects/[id]/stage-items/route.ts` | GET (seed-if-empty) + PATCH (toggle item done/undone, stamps `done_by`) |
| API gate | `apps/web/src/app/api/projects/[id]/route.ts` | `advance` action now **blocks** (HTTP 409) unless all required items of the current stage are done — enforced server-side, not just UI |
| UI | `apps/web/src/app/dashboard/projects/[id]/page.tsx` | New `StagePipeline` panel: horizontal stage tracker (done/current/upcoming) + current-stage checklist with owner-scoped toggles + gate badges + Advance button with blocking feedback. Existing date/card board kept underneath as the in-stage task view |
| Tests | `apps/web/tests/unit/project-stage-items.test.ts` | 7 tests for defaults, seeding, gate logic |

**Design decision:** kept the existing 12-stage `project-lifecycle` model and the card board; reframed
the board as a *gated pipeline* per the audit (§1.3). The generic Kanban is now the in-stage "tasks"
layer, not the spine.

**Verification**
- `vitest run tests/unit/` → **45 passed** (7 new).
- `tsc --noEmit` → **clean**.
- Dev server: `/dashboard/projects/1` → 307 (auth redirect, compiles), `/api/projects/1/stage-items`
  → 401 (`withAuth` path, compiles), no compile errors in logs.
- Lint: repo baseline is already red from a codebase-wide `catch (error: any)` convention; new code
  matches that convention and adds no new categories.

**Human-gated to go live**
- Apply migration `054` (and the other pending migrations `051`, `053`) to the hosted DB.
- Authenticated click-through of toggle → gate-block → advance with two real accounts.

---

## Slice B — Verification & badge system (non-blocking) ✅ code-complete

**What shipped**

| Layer | File | Change |
|---|---|---|
| Schema | `supabase/migrations/055_verification_system.sql` | `profiles.verification_status/verified_at/verified_badge` + badge-sync trigger + backfill from business `approval_status` & influencer `is_verified`; `verification_checks` (audit) + `verification_jobs` (queue) with RLS; `submit_verification()` (self-service, SECURITY DEFINER) and `admin_decide_verification()` (admin-only) RPCs that also insert notifications |
| Lib (SoT) | `apps/web/src/lib/verification.ts` | Pure scorer + `decide()` state machine. Thresholds: ≥0.85 auto-approve, ≥0.5 escalate, else needs-info. **Invariant: never auto-rejects**; fraud flags escalate. Notification copy per status |
| Lib | `apps/web/src/lib/verification-scraper.ts` | Pluggable signal builder. Default = deterministic structural validation of user-submitted data (GSTIN/URL/handle format, bio↔niche). Documented swap-in for a compliant fetcher/official APIs — no live scraping (ToS/PII) |
| API | `apps/web/src/app/api/verification/route.ts` | GET status + latest check; POST runs scrape→score→persist→notify. Access never depends on status |
| API | `apps/web/src/app/api/admin/verifications/route.ts` | Admin escalation queue (both roles, with `ai_score`/`ai_reason`) + PATCH resolve (verify/reject/needs-info) |
| API | `apps/web/src/app/api/profile/route.ts` | GET now returns `verification_status`/`verified_badge`/`verified_at` |
| UI | `apps/web/src/components/ui/verified-badge.tsx` | Reusable trust badge; renders only when verified in compact mode, all states with `showAll` |
| UI | `apps/web/src/components/dashboard/verification-panel.tsx` + `settings/page.tsx` | Status panel with "runs in the background — nothing is blocked" messaging + Run/Re-run button |
| Tests | `apps/web/tests/unit/verification.test.ts` | 11 tests: scoring, auto-approve/escalate/needs-info thresholds, never-auto-reject invariant, fraud escalation, scraper flags |

**Verification**
- `vitest` → **56 passed** (11 new). `tsc --noEmit` → **clean**.
- Dev server: `/api/verification` → 401, `/api/admin/verifications` → 401, `/dashboard/settings` → 307. No compile errors.

**Human-gated to go live**
- Apply migration `055`.
- Wire `VerifiedBadge` into the discover cards, message peer header, and public `c/[username]` / `b/[username]` profiles — needs the badge field added to those SECURITY DEFINER discover/public RPCs (follow-up).
- Optional: replace the heuristic scraper with a compliant fetcher / official platform APIs + a Claude scoring call behind the same interface.

## Slice C — Flow gaps (completion gate + report/block) ✅ code-complete (C1 deferred)

**What shipped**

| Layer | File | Change |
|---|---|---|
| Schema | `supabase/migrations/056_completion_and_safety.sql` | `campaign_projects.owner_confirmed_complete` / `counterparty_confirmed_complete`; `user_reports` + `user_blocks` tables with RLS (reporter/blocker own rows, admin manage) |
| API | `apps/web/src/app/api/projects/[id]/route.ts` | New `confirm_completion` action — sets the caller's flag; project reaches `project_completed` + `status='completed'` only when **both** parties confirm (protects reviews/payment) |
| API | `apps/web/src/app/api/reports/route.ts` | POST report a user (reason enum + details + project context) |
| API | `apps/web/src/app/api/blocks/route.ts` | GET/POST/DELETE block list |
| API | `apps/web/src/app/api/admin/reports/route.ts` | Admin moderation queue (GET open/reviewing) + PATCH status workflow |
| UI | `apps/web/src/app/dashboard/projects/[id]/page.tsx` | Final-payment stage now shows **dual-confirm completion** (your/other party state) instead of a plain Advance; Report-user button + reason/details modal in the top bar |

**Verification**
- `tsc --noEmit` → **clean**. `vitest` → **56 passed**.
- Dev server: `/api/reports` → 401, `/api/blocks` → 401, `/api/admin/reports` → 401, project page → 307. Compiles cleanly.
- Runtime 500s observed for `project_stage_items` / `reviews` / `owner_confirmed_complete` are **migrations-not-applied** signals against the hosted DB (see below), not code defects — the queries target the correct new schema.

**C1 — asset-bucket lockdown: intentionally deferred (tracked).** Migration `020` created the
`project-assets` bucket as `public=true`, and the app reads assets via public URLs. Flipping it to
private requires a coordinated change (private bucket + path-scoped storage RLS + signed-URL reads at
every load site). Shipping only the bucket flip would break asset viewing, so it's a dedicated task,
not folded in here.

---

## ⚠️ Required to run live: apply pending migrations

The hosted DB (per `.env.local`) is **behind** the migration folder — even `051_reviews_ratings`
(pre-existing) isn't applied (the `/api/projects/[id]/reviews` route 500s with "table reviews not
found"). Before any of this is exercisable end-to-end, apply the pending set **in order**:

`051_reviews_ratings` → `053_pii_lockdown` → `054_project_stage_items` →
`055_verification_system` → `056_completion_and_safety`

(e.g. `supabase db push`, or paste each into the Supabase SQL editor). Migrations are written
idempotent. Note `038`'s caveat still applies project-wide: `ALTER TYPE ... ADD VALUE` must run
outside a txn — not relevant to 054–056, which add no enum values.

After applying, the remaining human-gated checks are the authenticated click-throughs:
toggle→gate-block→advance, run-verification→badge, dual-confirm completion, report→admin queue.

