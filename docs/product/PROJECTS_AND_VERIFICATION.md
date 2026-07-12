# Product Audit — Projects & Verification System

**Date:** 2026-07-12
**Scope:** (1) Project/Kanban model, (2) Trust & verification badge system, (3) End-to-end flow audit, (4) Prioritized recommendations.
**Audience:** Internal product + dev planning. Plain language, implementation-focused.

---

> **Implementation status (2026-07-12):** Slices A (Stage Pipeline), B (Verification & badge),
> and C (completion gate + report/block) are code-complete and verified at the typecheck / unit-test /
> route-compile level. See [../IMPLEMENTATION_PROGRESS.md](../IMPLEMENTATION_PROGRESS.md) for the
> file-by-file log, the pending-migrations apply order, and the deferred asset-lockdown (C1) task.

## 0. TL;DR

- **Kanban is the wrong primary tool here.** A creator↔business collab is a *linear, gated, two-party deal* (money changes hands, deliverables get approved). You've actually already half-built the right thing: a **12-stage pipeline** (`STAGE_CONFIG` in `apps/web/src/app/dashboard/projects/[id]/page.tsx`) on a date grid. Lean into a **Stage Pipeline + per-stage checklist + payment/approval gates**, and keep Kanban only as an optional "my tasks" view inside a stage.
- **Verification foundation already exists and is non-blocking by accident, which is good.** `business_profiles.approval_status` (`pending_review | approved | rejected`, migration `010`) is stored and surfaced but is **not** enforced at login/middleware. That's exactly the behavior you want — we just need to formalize it, extend it to creators, add the AI scoring step, and add badge + notification plumbing.
- **Biggest risks are legal/trust, not technical:** scraping social profiles and business data has real ToS/PII exposure; "Verified" is a promise you can be liable for; and there's no dispute/refund/reporting path around money and deliverables.

---

## 1. Kanban Evaluation

### 1.1 What exists today

| Piece | Where | What it is |
|---|---|---|
| 12 sequential stages | `STAGE_CONFIG` in `dashboard/projects/[id]/page.tsx` | `collaboration_started → project_discussion → advance_payment → content_planning → content_confirmation → shooting_in_progress → editing_in_progress → sent_for_review → revisions → final_approval → final_payment → project_completed` |
| Cards | `project_cards` (migration `039`) | `stage_key`, `title`, `description`, `due_date`, `start_date` (`040`), `color` (`041`), `position`, `status` (`not_started \| in_progress \| completed`) |
| Card placement | `[id]/page.tsx` | Cards are placed by **stage column × date cell** — this is already a timeline/Gantt hybrid, not a free Kanban |
| Assets | `project_assets` (`020`) | File/link deliverables per project |
| Reviews | `reviews` (`051`) | 1–5 rating, only on `status = 'completed'` projects |

**Observation:** The board is presented as a Kanban, but the underlying model is a **fixed 12-step pipeline with dates**. Cards don't flow freely across arbitrary columns — the columns *are* the deal stages, and they're inherently ordered.

### 1.2 Is Kanban the right tool?

**No — not as the primary model.** Kanban is designed for a *continuous flow of independent work items* through *team-defined* columns (e.g. a dev backlog). A creator–business collaboration is the opposite:

| Property of this domain | Kanban assumption | Mismatch |
|---|---|---|
| One deal, followed start→finish | Many independent cards flowing | High |
| Stages are ordered & gated (can't shoot before deposit) | Columns are peer states, freely reorderable | High |
| Money + legal approval gates between stages | No concept of a gate | High |
| Two specific parties with different responsibilities | WIP owned by a team | Medium |
| "Done" = paid + delivered + reviewed | "Done" = last column | Medium |

A generic Kanban invites confusion: nothing stops a card being dragged to "Completed" while payment is unpaid, and it gives no shared sense of *"where is this deal right now and what's blocking it."*

### 1.3 Recommended model: **Stage Pipeline + gated checklist**

Keep the 12 stages (they're good and domain-accurate), but reframe the UI and add structure:

1. **Primary view = a horizontal Stage Tracker** (you already render `Stage N/12`). One stage is "current." This answers the #1 question both users have: *"what happens next and who's blocking?"*
2. **Each stage owns a checklist** of concrete items with an owner (`business` / `creator` / `both`) and a done-state. A stage is complete only when its required items are checked.
3. **Gates between stages.** Some transitions require a condition:
   - `advance_payment` → cannot advance until deposit marked paid.
   - `content_confirmation` / `final_approval` → requires the business to explicitly approve deliverables.
   - `project_completed` → requires final payment + both approvals, which then *unlocks reviews* (matches `reviews` RLS: completed-only).
4. **Keep a lightweight task board *inside* a stage** for people who like Kanban — the existing `project_cards.status` (`not_started/in_progress/completed`) is perfect for a 3-column "New / In progress / Done" mini-board scoped to the current stage. This preserves your existing investment without making it the spine.

**Why this is better:** it encodes the real-world dependencies (money, approvals) the business actually runs on, gives both parties a single shared status, and makes "completed" *mean* something (which your review system already depends on).

### 1.4 Concrete schema delta for the pipeline

```sql
-- New: per-stage checklist items (gates)
CREATE TABLE public.project_stage_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   bigint NOT NULL REFERENCES public.campaign_projects(id) ON DELETE CASCADE,
  stage_key    text NOT NULL,                    -- matches STAGE_CONFIG keys
  label        text NOT NULL,
  owner_role   text NOT NULL DEFAULT 'both',     -- 'business' | 'creator' | 'both'
  is_required  boolean NOT NULL DEFAULT true,    -- required items gate the stage
  is_gate      boolean NOT NULL DEFAULT false,   -- true = payment/approval gate
  done_at      timestamptz,
  done_by      uuid REFERENCES public.profiles(id),
  position     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- RLS: same participant pattern as project_cards (owner_user_id / counterparty_user_id).
```

Advancement rule (enforce in the stage-advance API route, not just UI): *a project may move to stage N+1 only when every `is_required` item in stage N is `done_at IS NOT NULL`.*

---

## 2. Verification & Badge System Design

### 2.1 Design principles

1. **Never blocks.** A brand-new user is `unverified` and has **full** dashboard/project/messaging access immediately. Verification runs in the background. (Your `approval_status` already behaves this way — we formalize it.)
2. **Two-tier decision:** AI scores confidence → auto-approve, auto-hold, or escalate to a human admin.
3. **Same state machine for both user types**, different evidence inputs.
4. **Badges are earned, reversible, and auditable.**

### 2.2 State machine (single source of truth)

Replace the business-only `approval_status` with a shared `verification_status` on `profiles` (so creators get it too):

```
unverified → pending → in_review → { verified | rejected }
                  │                        │
                  └──────── needs_more_info ┘  (user re-submits → pending)
```

| State | Meaning | Badge shown | Access |
|---|---|---|---|
| `unverified` | Just signed up, nothing submitted / job not queued | none (or subtle "Unverified") | **Full** |
| `pending` | Evidence submitted, scrape+AI job queued/running | "Verification in progress" (grey) | **Full** |
| `in_review` | AI escalated to a human admin | "Under review" (grey) | **Full** |
| `verified` | Auto-approved by AI or by admin | ✅ Verified (blue/brand) | **Full** |
| `needs_more_info` | AI/admin needs more data (e.g. add a real handle) | "Action needed" (amber) | **Full** |
| `rejected` | Failed verification | none + reason surfaced to user | **Full**, but no badge; optionally limited outreach volume |

> Key point: the **Access** column is "Full" in every row. Verification only changes the badge and trust signals, never the ability to use the product.

### 2.3 Data model

```sql
-- On profiles (shared by both roles)
ALTER TABLE public.profiles
  ADD COLUMN verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN verified_at         timestamptz,
  ADD COLUMN verified_badge      boolean NOT NULL DEFAULT false; -- fast read for UI

-- One row per verification attempt (full audit trail)
CREATE TABLE public.verification_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text NOT NULL,                 -- 'business_owner' | 'influencer'
  status        text NOT NULL DEFAULT 'pending',
  ai_score      numeric,                        -- 0.00–1.00 confidence
  ai_reason     text,                           -- model's explanation (for admin)
  ai_signals    jsonb NOT NULL DEFAULT '{}',    -- structured evidence (see below)
  decided_by    text,                           -- 'ai' | admin user_id
  decided_at    timestamptz,
  reviewer_notes text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- RLS: user reads own rows (not ai_reason if you want to hide model internals);
--      admins read all via is_admin(); writes only by service role / admin.
```

Migrate existing `business_profiles.approval_status` values into `profiles.verification_status` (`approved→verified`, `pending_review→pending`, `rejected→rejected`) so the admin approvals page keeps working.

### 2.4 Evidence inputs (what the scraper collects)

| User type | Inputs (already collected) | Scrape target | Signals scored |
|---|---|---|---|
| Business owner | `company_name`, `website`, `gst_number`, `industry`, `city/state` (`011`, `001`) | Public website, business registry / GST lookup, domain WHOIS age | Domain exists & resolves; website mentions company name; GST format valid; domain age; contactable |
| Creator | `instagram_handle`, `youtube_handle`, `twitter_handle`, `niche`, `bio` (`001`) | The submitted public social profiles only | Handle exists; follower count plausible; posting recency; bio/niche consistency; not an obvious impersonation |

**`ai_signals` example (stored, feeds the score):**
```json
{
  "website_resolves": true,
  "website_mentions_name": true,
  "gst_format_valid": true,
  "domain_age_days": 812,
  "social_handles_live": { "instagram": true, "youtube": false },
  "follower_count": 48200,
  "last_post_days_ago": 3,
  "flags": ["youtube_handle_not_found"]
}
```

### 2.5 The AI confidence-scoring step

1. Scrape job assembles `ai_signals`.
2. Send signals (not raw scraped HTML) to the model with a strict rubric → returns `ai_score` (0–1) + `ai_reason` + recommended action. Use a Claude model via your existing server API layer; keep it a **structured/JSON** call so the output is machine-usable.
3. Apply thresholds (tune with data; start conservative):

| `ai_score` | Action | Resulting status |
|---|---|---|
| ≥ 0.85 | **Auto-approve** | `verified` (`decided_by='ai'`) |
| 0.50 – 0.85 | **Escalate** to admin | `in_review` |
| < 0.50 but not clearly fake | **Ask for more info** | `needs_more_info` |
| Clear fraud signal (dead handles, fake domain) | Escalate, never auto-reject | `in_review` |

> **Never let the AI auto-*reject*.** Auto-approve is low-risk (you can revoke), but auto-reject damages real users and creates bias/liability. All negatives go through a human.

### 2.6 Background execution (never blocks)

Because Supabase realtime is only enabled on `notifications` (see `047` comment), run verification as an out-of-band job, not inside the signup request:

- **Trigger:** on profile submit / handle update, enqueue a job (row in a `verification_jobs` table polled by a worker, or a queue like the Upstash you already have pending per your infra notes).
- **Worker:** scrape → build signals → AI score → apply threshold → write `verification_checks` + update `profiles.verification_status` + insert a `notifications` row.
- **Signup path does nothing synchronous.** User lands on the dashboard as `pending` and keeps working.
- **Admin escalations** appear in the existing approvals UI (`dashboard/admin/approvals`), extended to creators and to show `ai_score` + `ai_reason` + `ai_signals`.

### 2.7 Notifications (reuse existing pipeline `047`)

Add `notification.type` values and reuse the trigger/insert pattern:

| Event | `type` | Title | Link |
|---|---|---|---|
| AI or admin approves | `verification_approved` | "You're verified ✅" | `/dashboard/profile` |
| Escalated to admin | `verification_in_review` | "Verification under review" | `/dashboard/profile` |
| Needs more info | `verification_needs_info` | "Action needed to get verified" | `/dashboard/profile` |
| Rejected | `verification_rejected` | "Verification update" (soft wording + reason) | `/dashboard/profile` |

### 2.8 Badge rendering

Your `Badge` component (`components/ui/badge.tsx`) and `statusVariant()` already map `"verified"` → `success`. Add a dedicated verified badge (icon + tooltip "Identity verified on <date>") shown on:
- Dashboard header / own profile
- Public profiles `c/[username]` and `b/[username]`
- Discover cards and message peer headers

Only render the badge when `profiles.verified_badge = true`. Keep a plain "Unverified/Pending" affordance elsewhere so absence of a badge is legible, not silent.

---

## 3. Full Flow Audit (onboarding → completion)

Journey: **Sign up → Onboard → (background verification) → Discover/Connect → Project → Collaborate → Complete → Review.**

| Stage | Current state | UX gaps | Business / trust / legal risk |
|---|---|---|---|
| **Signup** (`signup/business`, `signup/influencer`) | Role-split signup; business collects GST/website; creator collects handles | No "you can start now, verification runs in background" messaging → users may think they're blocked | GST/PII collected → must be covered by privacy policy + storage lockdown (you have `053_pii_lockdown`) |
| **Onboarding** (`031` onboarding_progress) | Progress tracked | Verification not introduced here; user doesn't know a badge exists or how to earn it | Setting expectation of "verified" without a clear method invites distrust |
| **Verification** | Business `approval_status` stored, **not enforced** (good); no creator equivalent; no AI step yet | No visible status, no ETA, no "what's needed" | **Scraping social + business data**: platform ToS violations, rate-limiting/blocking, and PII handling; "Verified" is a **liability claim** if you badge a bad actor |
| **Discover / Connect** (`discover`, `connections` `029`, `collab_requests`) | Businesses browse creators; send collab requests; notifications fire (`047`) | Unverified users indistinguishable from verified in lists unless badge added; no filter "verified only" | No visible reputation before badge exists → higher scam risk in early cohort |
| **Project creation** (`campaign_projects` `006`) | Owner creates project on accepted request (RPCs `043`) | Only owner can insert; no shared "agree to scope/budget" step; budget is a free `numeric` with no currency/escrow | **No agreed terms of engagement** = disputes; money is off-platform, so you carry reputational risk without control |
| **Collaboration** (Kanban `039`, assets `020`, messages) | 12-stage board, file/link assets, chat | Kanban lets "done" without gates (see §1); no per-stage responsibilities; no payment/approval record | Deliverable IP/ownership unclear; asset bucket is **public** (`020` sets bucket `public=true`) → private deliverables may be world-readable |
| **Completion** | `status='completed'` unlocks reviews (`051`) | No explicit "both parties confirm complete" gate; who sets `completed`? | If either party can unilaterally mark complete, reviews can be gamed / payment disputes arise |
| **Reviews** (`051`) | 1–5, completed-only, RLS-enforced (good, forgery-blocked) | No response-to-review; no report/abuse path | Defamatory/retaliatory reviews with no moderation or right-of-reply |
| **Trust & safety (cross-cutting)** | — | No block/report user, no dispute flow, no admin action on messages | Harassment, scams, and disputes have no in-product resolution path |

### Highest-severity gaps (fix regardless of Kanban decision)

1. **Public `project-assets` bucket** (`020`) — deliverables may be publicly accessible by URL. Verify and lock down to participant-only signed URLs.
2. **Scraping legal exposure** — need (a) a documented lawful basis, (b) respect for target ToS/robots, (c) scrape only *user-submitted* public URLs/handles, (d) store signals not raw dumps, (e) a privacy-policy clause. Treat social platforms' anti-scraping ToS as a real constraint; prefer official APIs / oEmbed where available.
3. **"Verified" as a legal claim** — define precisely what the badge asserts ("we checked this handle/website is live and matches the stated identity" — *not* "we vouch for them"). Put it in ToS. Always human-gate rejections and keep the audit trail (`verification_checks`).
4. **No dispute / report / block** around money + deliverables — minimum viable: report-user, block-user, and an admin dispute queue.
5. **Completion & payment are unmodeled** — add explicit dual-confirmation for completion and at least a *record* of payment gates, even if money stays off-platform.

---

## 4. Prioritized Recommendations

### Quick wins (days — low risk, high trust payoff)

| # | Item | Why |
|---|---|---|
| Q1 | **Add "Verified" badge + `verification_status` on `profiles`** and render on profiles/discover/header | Immediate visible trust signal; small schema delta |
| Q2 | **Onboarding copy: "Start now — verification runs in the background"** | Removes the #1 misperception that users are blocked |
| Q3 | **Lock down `project-assets` bucket** to participant-only (signed URLs), audit current public exposure | Closes a real data-leak risk |
| Q4 | **Reframe the board as a Stage Tracker** (you already compute `Stage N/12`); make current stage prominent | Answers "what's next" without a schema change |
| Q5 | **Report + block user** buttons → admin queue | Baseline trust & safety |
| Q6 | **Privacy policy + ToS clauses** for data collection, scraping scope, and what "Verified" means | Legal hygiene before any scraping ships |
| Q7 | **Extend admin approvals UI to creators** (it's business-only today) | Reuses existing screen; unblocks manual verification immediately, even before AI |

### Medium term (1–3 weeks)

| # | Item | Why |
|---|---|---|
| M1 | **Background verification worker** (queue → scrape → signals → AI score → threshold → notify) | The core non-blocking flow; auto-approve high-confidence, escalate the rest |
| M2 | **`verification_checks` audit table + AI `ai_signals`/`ai_score`/`ai_reason`** surfaced in admin review | Auditable, tunable, defensible decisions |
| M3 | **Per-stage checklist + gates** (`project_stage_items`) with server-enforced advancement | Turns the pipeline into a real workflow; makes "completed" trustworthy |
| M4 | **Dual-confirm completion** before `status='completed'` (which gates reviews) | Prevents gamed reviews / premature completion |
| M5 | **"Verified only" filter in Discover** + sort verified first | Rewards verification, drives adoption of the badge |
| M6 | **Review right-of-reply + report-review** | Fairer reputation system |

### Longer term (1–3 months)

| # | Item | Why |
|---|---|---|
| L1 | **Dispute resolution flow** (open dispute → freeze completion/reviews → admin adjudicates) | Real protection around money + deliverables |
| L2 | **Payment gate records / optional escrow or milestone payments** | Moves money on-platform → control, fees, and trust |
| L3 | **Badge tiers** (e.g. Verified → Verified+ with track record: N completed projects, avg rating) | Reputation depth beyond a binary badge |
| L4 | **Re-verification / badge expiry & revocation** (handles die, businesses close) | Keeps "Verified" honest over time |
| L5 | **Prefer official platform APIs over scraping** where volume justifies | De-risks the ToS/scraping exposure structurally |

---

## 5. Appendix — What to reuse vs. build

**Reuse as-is:**
- `notifications` pipeline + triggers (`047`) — add verification `type`s.
- `Badge` / `statusVariant()` — already maps `verified → success`.
- `is_admin()` + admin RLS (`038`) and the approvals screen — extend to creators.
- `reviews` RLS (`051`) — already forgery-proof and completion-gated; build completion gate to feed it.
- The 12-stage `STAGE_CONFIG` — keep the stages, change the framing.

**Build new:**
- `profiles.verification_status` / `verified_badge` (+ migrate `approval_status`).
- `verification_checks` (+ optional `verification_jobs` queue table) and the background worker.
- `project_stage_items` (checklist/gates) + server-enforced stage advancement.
- Trust & safety primitives: report, block, dispute.

**Decisions that need a human (not code):**
- Legal basis + ToS wording for scraping and the "Verified" claim.
- AI score thresholds (start at 0.85 / 0.50, tune on real data).
- Whether money moves on-platform (drives the escrow/dispute roadmap).
