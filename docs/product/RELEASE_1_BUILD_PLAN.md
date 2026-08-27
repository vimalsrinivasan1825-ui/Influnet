# Release 1 — Build Plan

**Companion to** the scope document served at `/r/<token>/release-1`
(`apps/web/src/app/r/[token]/release-body.ts`). That document says *what* R1 is
and *why*. This one says *how*, in the order it should be built, one task at a
time.

Written 27 August 2026 against a direct read of the codebase at `dev`
(`0cb270f2`), migrations applied through **118**.

Nothing in sections A, B or C exists yet. Every file path below that does not
exist today is marked **new**.

---

## 0. How to read this

Every task has the same seven fields. If a task cannot fill all seven, it is not
scoped yet and should not be started.

| Field | Meaning |
|---|---|
| **Depends on** | Tasks that must be merged to `dev` first |
| **Decision** | An open question from §8 of the scope doc that blocks this task |
| **Migration** | Reserved number, or "none" |
| **Touches** | The files to read before writing anything |
| **Contract** | The API shape — remember [envelopes differ per route](../../AGENTS.md) |
| **Invariants** | What must still be true afterwards. These are regressions waiting to happen |
| **Done when** | The checkable end state |

Task IDs are stable. Use them in branch names (`feat/a2-shortterm-proposal`) and
commit subjects, so the plan and the git history line up.

---

## 1. The task loop

Run this cycle for every task. It is the same eight steps each time; the point is
that no step is ever skipped because a task "looked small".

```
 1  PICK      One task. Never two. Read its "Touches" files start to finish
               before writing a line.

 2  DECIDE    If the task has a Decision, it is blocked. Do not assume an
               answer. Move to the next unblocked task and raise the question.

 3  MIGRATE   Write the migration first, alone, with the WHY in a header
               comment the way 113–118 do. Apply to dev:
                   node scripts/apply-migration.mjs <version>
               Verify it landed before writing code that assumes it.

 4  CORE      Types, stage tables, state machines → packages/core.
               Names and types only, never numbers — limits live in
               billing_settings. Web and mobile must not be able to disagree.

 5  SERVER    The API route. In this order, no exceptions:
                 withAuth → participation/ownership check → enforceRateLimit
                 → zod parse → RPC or query → notifyUser → NextResponse
               A client-supplied amount, a client-supplied status, or a
               client-supplied "who I am" is a bug, not a shortcut.

 6  CLIENTS   Web first (apps/web), then mobile (apps/mobile) in the SAME task.
               A task that ships web-only re-opens the parity gap that took
               two audits to close. If mobile genuinely cannot follow (a native
               dependency), say so in the commit and add it to §9.

 7  PROVE     - npm run typecheck (both apps)
               - a phase in tests/e2e/ that drives the real API with two
                 accounts. Turn NOTIFY_EMAILS_ENABLED OFF first, restore after.
               - npx expo export for anything mobile
               Never "it should work". The audit harness is the proof.

 8  RECORD    Update this file's checkbox, append the decision to
               docs/product/DECISIONS.md if one was made, bump
               LAST_COMMIT_TIME in apps/mobile/app/settings.tsx on any mobile
               change, and commit on `dev`. One task, one commit.
```

**Branch rule.** Everything is written on `dev`. `staging` only ever receives, by
PR. `git log origin/staging..origin/dev` should be the list of R1 tasks and
nothing else.

---

## 2. Order of work

Two lanes that do not block each other. The business-owner side — open campaigns
— is Lane 2 and can start on day one with a second person; it shares no code with
Lane 1 until the single hand-off point at **C4**.

```
LANE 1  the deal gets shorter and produces paperwork
        A1 ─ A2 ─ A3 ─ A4 ─ A5 ──┐
                                  ├─ B1 ─ B2 ─ B3 ─ (B4 conditional)
                                  │
LANE 2  the brand can advertise, the creator can find work
        C1 ─ C2 ─ C3 ─ C4 ─ C5 ─ C6
                       │
                       └─ hand-off: an accepted application must land in the
                          EXISTING collab_request → conversation → proposal
                          flow. C4 is the only task that touches Lane 1 code.

LANE 3  independent, any order, anyone free
        S1  creator level      S2  creating since     S3  favourites
        S4  networking funnel  S5  reviews & reputation
```

**Migration numbers are reserved up front** so two people working in parallel
cannot collide. A collision has cost this project a renumber before (098 → 100).
Take your number from this table and nobody else's:

| # | Task | Subject |
|---|---|---|
| 119 | A1 | Project flows: `flow_key`, short-term columns |
| 120 | A4 | Short-term payment gate + barter |
| 121 | B1 | `project_documents` + snapshots |
| 122 | B4 | Gapless tax-invoice numbering series |
| 123 | C1 | `campaigns` |
| 124 | C3 | `campaign_applications` |
| 125 | C4 | `accept_campaign_application()` RPC |
| 126 | C6 | Campaign limits in `billing_settings` |
| 127 | S3 | `saved_items` (favourites) |
| 128 | S2 | `profiles.creating_since` |
| 129 | S5 | Review criteria + brand ratings |

Leave a gap if a task is dropped. Gaps are harmless; collisions are not.

---

## 3. Lane 1 · Item A — Short-term projects

### The architectural decision that makes this safe

There is exactly one project state machine today, in
`packages/core/src/project-lifecycle.ts`: `STAGES` (12 entries),
`ALLOWED_TRANSITIONS`, `STAGE_ACTOR`, `STAGE_PHASE`. Every gate, every sign-off,
every notification and both payment gates read from it.

**Do not build a second machine.** Building a parallel "quick project" path means
duplicating the consent checks, the atomic sign-off, the fail-closed checklist
gate and the payment webhook — and this codebase has already had to close
unilateral-close and consent-bypass bugs twice. A second machine is a second
place for that class of bug to come back.

Instead, make the existing machine **table-driven by flow**:

```ts
// packages/core/src/project-lifecycle.ts
export type FlowKey = 'full' | 'short_pay_after' | 'short_pay_before';

export interface StageFlow {
  stages: readonly string[];
  transitions: Record<string, string[]>;
  actor: Record<string, 'business' | 'creator' | 'either'>;
  phase: Record<string, StagePhase | null>;
  labels: Record<string, string>;
}

export const STAGE_FLOWS: Record<FlowKey, StageFlow> = { ... };

/** Every consumer goes through here. Nothing reads STAGES directly any more. */
export function flowOf(project: { flow_key?: string | null }): StageFlow;
```

`STAGES` / `ALLOWED_TRANSITIONS` stay exported as `STAGE_FLOWS.full.*` so
existing callers keep compiling, and are migrated call site by call site in A1.

The two short flows:

| flow_key | stages | why two |
|---|---|---|
| `short_pay_after` | `quick_agreement` → `quick_delivery` → `quick_payment` → `project_completed` | default: deliver, then get paid |
| `short_pay_before` | `quick_agreement` → `quick_payment` → `quick_delivery` → `project_completed` | brand pays up front |

`quick_agreement` exists so the "confirm the whole card, both sides" step from
the scope doc is a real stage with real mutual sign-off, not an implicit state.
It is entered already signed by the proposer.

---

### A1 · Flow foundation

- **Depends on** nothing. Start here.
- **Decision** none.
- **Migration** `119_project_flows.sql`.
- **Touches**
  - `packages/core/src/project-lifecycle.ts`
  - `packages/core/src/project-stage-guide.ts`
  - `packages/core/src/project-turn.ts`
  - `apps/web/src/lib/project-stage-items.ts`
  - `apps/web/src/lib/stage-items-gate.ts`
  - `apps/web/src/app/api/projects/[id]/route.ts` (all 1140 lines — every
    `STAGES` and `ALLOWED_TRANSITIONS` reference)
  - `apps/mobile/app/projects/`
- **Migration content**
  ```sql
  ALTER TABLE public.campaign_projects
    ADD COLUMN IF NOT EXISTS flow_key TEXT NOT NULL DEFAULT 'full'
      CHECK (flow_key IN ('full','short_pay_after','short_pay_before')),
    ADD COLUMN IF NOT EXISTS deliverables    TEXT,
    ADD COLUMN IF NOT EXISTS start_date      DATE,
    ADD COLUMN IF NOT EXISTS is_barter       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS barter_details  TEXT;
  ```
  Every existing row becomes `'full'` by the default, which is what it already
  is. Then a trigger that makes `flow_key` **immutable after insert** — the
  scope doc says the choice is made once and is not a setting, and the answer to
  open question 3 ("can a short project become a full one?") is *no*. Enforce
  that in the database, not in a route, because converting mid-flight would mean
  reconciling stage history against a payment already taken.
- **Contract** no route changes in this task. `GET /api/projects` and
  `GET /api/projects/[id]` return the new columns because they `select *`.
- **Invariants**
  - A project with `flow_key='full'` behaves **identically** to today. The
    existing e2e phases are the proof; they must pass unchanged.
  - No code path reads `STAGES` directly after this task. `grep -rn "STAGES\b"`
    across `apps/` should return only `flowOf()` and the flow tables.
- **Done when** the full 12-stage flow still passes every existing
  `tests/e2e/` phase, and `flowOf()` is the only way anyone gets a stage list.

---

### A2 · Choosing the kind at proposal time

- **Depends on** A1.
- **Decision** **Q2 — does a short-term project allow an advance?** The plan
  assumes one payment. If an advance is allowed this becomes a three-step flow
  and `short_pay_before`/`short_pay_after` become insufficient. **Build the
  single-payment version; do not design for an advance until this is answered.**
- **Migration** none — 119 covers the columns. `project_proposals` needs the
  same fields, so add them in 119 too:
  ```sql
  ALTER TABLE public.project_proposals
    ADD COLUMN IF NOT EXISTS flow_key TEXT NOT NULL DEFAULT 'full' CHECK (...),
    ADD COLUMN IF NOT EXISTS deliverables TEXT,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS is_barter BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS barter_details TEXT;
  ```
  and extend `propose_project()` / `respond_to_proposal()` (migration 071) to
  carry them through. **Both RPCs change signature** — grant execute on the new
  signature and drop the old one in the same migration, or PostgREST will
  resolve to whichever it finds first.
- **Touches**
  - `supabase/migrations/071_project_proposals.sql` (read; do not edit)
  - `apps/web/src/app/api/conversations/[id]/deal/route.ts` — `ProposeSchema`,
    the `propose_project` call, the `respond_to_proposal` call
  - the in-chat deal card component under `apps/web/src/app/dashboard/messages/`
  - `apps/mobile/app/conversations/`
- **Contract** `POST /api/conversations/[id]/deal` gains:
  ```ts
  flow_key: z.enum(['full','short_pay_after','short_pay_before']).default('full'),
  deliverables: z.string().max(4000).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  is_barter: z.boolean().default(false),
  barter_details: z.string().max(1000).optional(),
  ```
  Server-side validation, all of it rejected with 400, none of it defaulted
  silently:
  - a short flow **requires** `due_date` — "a short-term project with no
    delivery date is a full project wearing the wrong label"
  - a short flow **requires** either `budget > 0` or
    (`is_barter = true` and `barter_details` non-empty)
  - `is_barter = true` forces `budget = 0` and rejects a non-zero budget
    outright rather than overwriting it
  - `advance_amount` must be null on a short flow (until Q2 says otherwise)
- **Invariants**
  - Accepting a proposal is still the **only** thing that creates a
    `campaign_projects` row. There is still no `POST /api/projects`.
  - The free-tier conversion cap still fires. It is a `BEFORE INSERT` trigger on
    `campaign_projects` (115/117) so it applies automatically — but assert it in
    the test, because "a short project shouldn't count" is exactly the kind of
    convenience someone adds later.
  - The ownership gate on `action:'accept'` still runs.
- **Done when** a creator and a brand can agree short-term terms in chat, and
  the resulting project row has the right `flow_key`, the right stage, and a
  seeded checklist.

---

### A3 · The short-term stage machine

- **Depends on** A1, A2.
- **Decision** none.
- **Migration** none.
- **Touches**
  - `packages/core/src/project-lifecycle.ts` (the two short flow tables)
  - `apps/web/src/lib/project-stage-items.ts` — `DEFAULT_STAGE_ITEMS` becomes
    per-flow: `DEFAULT_STAGE_ITEMS[flowKey][stageKey]`
  - `apps/web/src/lib/stage-items-gate.ts` — `stageHasRequiredItems()` and
    `buildDefaultStageItems()` both need the flow
  - `apps/web/src/app/api/projects/[id]/route.ts`
- **Stage definitions**

  | stage | actor | required items | how it moves |
  |---|---|---|---|
  | `quick_agreement` | either | scope confirmed by both | mutual `signoff` |
  | `quick_delivery` | creator posts, business confirms | work delivered (link or upload) | mutual `signoff` |
  | `quick_payment` | business | payment received — **gate item** | webhook (A4), then `confirm_completion` |
  | `project_completed` | — | — | terminal |

- **Invariants**
  - Every non-terminal short stage moves by **mutual** sign-off, via
    `record_stage_signoff()` (migration 114). Never read-modify-write
    `stage_progress` from a route.
  - `confirm_completion` remains the only door to `project_completed`, on both
    flows. `advance` must still be refused there.
  - Short stages are **not skippable**. `propose_skip` must reject any stage in
    a short flow — there are only three, and skipping one is skipping the whole
    project.
  - `blockingItems([])` on a short stage that has defined items still fails
    **closed**. Add the empty-checklist case to the test for the new stage keys;
    that is the bug the 2026-08-08 audit found and it will not announce itself.
- **Done when** two accounts drive a short project end to end through the API
  harness, and every attempt by one account acting alone is refused.

---

### A4 · The single payment gate, and barter

- **Depends on** A3.
- **Decision** none (Q2 affects A2, not this).
- **Migration** `120_short_term_payment_guard.sql` — *not* for the ledger (see
  Touches), but for the barter guard below: a trigger that refuses to move a
  non-barter short project into `project_completed` while its payment ledger
  holds no confirmed row. Defence in depth, in the same spirit as the consent
  triggers in 081/082. If the barter design lands without it, leave 120 unused.
- **Touches**
  - `apps/web/src/app/api/projects/[id]/payments/route.ts` — `CreateOrderSchema`
    hardcodes `stage_key: z.enum(['advance_payment','final_payment'])`
  - `apps/web/src/app/api/payments/webhook/route.ts`
  - `apps/web/src/lib/payments/razorpay.ts`
  - `supabase/migrations/059_project_payments.sql` — read it: `stage_key` is
    plain `text NOT NULL` with **no CHECK constraint**, so the new stage key
    needs no schema change. The constraint that matters is the zod enum in the
    route, and that is the one to widen.
- **What changes**
  - `stage_key` accepts `quick_payment`.
  - The amount is still **derived server-side** from the project row. For a
    short flow that is the whole `budget`, since there is no advance. The client
    never sends it; `amount_rupees` stays an optional field that exists only so
    a mismatch can be rejected loudly.
  - The webhook ticks the `quick_payment` gate item exactly as it ticks
    `advance_payment` / `final_payment` today.
- **Barter — the one place this could go wrong**

  A barter project has `budget = 0`, so there is no Razorpay order and no
  webhook to open the gate. The gate therefore opens on **mutual sign-off
  instead**, and that is only acceptable because:

  1. `is_barter` is fixed at proposal time and agreed by both parties;
  2. `is_barter` is **immutable after insert** (enforce in the 119 trigger
     alongside `flow_key`);
  3. the barter path is selected by the *stored* `is_barter` flag, never by
     "the amount happens to be zero" at request time.

  Write the test that proves a non-barter short project **cannot** reach
  `project_completed` with an empty payment ledger. That is the 2026-08-08 bug
  in a new costume, and it is the single highest-risk line in Lane 1.
- **Invariants**
  - Razorpay configured ⇒ a money gate opens only on a signature-verified
    capture. No manual tick, no "for testing" bypass.
  - Amounts are never read from the request body.
- **Done when** the harness drives a real test-mode payment through
  `quick_payment`, and a separate phase proves the barter path cannot be reached
  by a project that was not created as barter.

---

### A5 · Short-term project UI, web and mobile

- **Depends on** A3 (A4 for the pay button).
- **Decision** none.
- **Touches**
  - `apps/web/src/app/dashboard/projects/[id]/`
  - `apps/web/src/app/projects-workspace.css`
  - `apps/mobile/app/projects/`
  - `apps/mobile/app/(tabs)/projects.tsx`
  - `packages/core/src/project-turn.ts` — the home "whose move is it" logic must
    understand short stages or a short project will silently never appear on
    the Home action console
- **What it looks like**
  - The proposal card in chat gets a **kind selector** at the top — two cards,
    Full and Short-term, chosen before any other field, because the fields
    below it differ.
  - A short project renders as **three steps, not twelve**. Reuse the stage
    components; do not fork them. If the twelve-stage component cannot render
    three stages, that is a bug in the component, not a reason for a second one.
  - The 12-stage pipeline view, the phase grouping (`STAGE_PHASE`) and the
    progress percentage all read from `flowOf()`. `stageProgressPercent()` on a
    3-stage flow must give 0 / 33 / 67 / 100, not a number derived from 12.
- **Invariants** mobile ships in this task. Bump `LAST_COMMIT_TIME` in
  `apps/mobile/app/settings.tsx` in the shipping commit.
- **Done when** both platforms can run a short project to completion, and a
  short project appears correctly on Home, on the projects list, and in the
  activity timeline.

---

## 4. Lane 1 · Item B — Invoices & receipts

### B1 · The document store

- **Depends on** A4 (a short project must be able to produce one; a full project
  already can).
- **Decision** **Q1 — receipt or tax invoice, and who is the supplier?**
  This blocks **B4 only**. B1–B3 build the receipt, which carries no tax claim
  and therefore needs no answer. Start now.
- **Migration** `121_project_documents.sql`.
  ```sql
  CREATE TABLE public.project_documents (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  bigint NOT NULL REFERENCES public.campaign_projects(id) ON DELETE CASCADE,
    kind        text NOT NULL CHECK (kind IN ('proforma','receipt','tax_invoice')),
    number      text NOT NULL,           -- the issued series number
    snapshot    jsonb NOT NULL,          -- everything printed, frozen at issue
    total_paise bigint NOT NULL,
    currency    text NOT NULL DEFAULT 'INR',
    file_url    text,                    -- Cloudinary raw asset, once rendered
    issued_by   uuid REFERENCES public.profiles(id),
    issued_at   timestamptz NOT NULL DEFAULT now(),
    cancelled_at timestamptz,
    UNIQUE (kind, number)
  );
  ```
  RLS: SELECT for the two project participants only, using the same
  owner/counterparty test as `campaign_projects`. No INSERT/UPDATE for
  `authenticated` — documents are written by the route with the service role, so
  a participant cannot forge one by talking to PostgREST with the anon key.
- **The snapshot is the point.** "Regenerating gives back the same document; it
  is not re-rendered from data that may have moved on." The `snapshot` jsonb
  holds the parties, the title, the deliverables, the dates, the agreed amount
  and every payment row **as they were at issue**. Rendering reads the snapshot
  and nothing else.
- **Invariants** a row is never updated after `issued_at`. Correction =
  `cancelled_at` on the old row plus a new row. This is not negotiable for
  `tax_invoice` and is good discipline for `receipt`.
- **Done when** the table exists on dev and a participant using the anon key
  gets nothing back from it.

---

### B2 · The generator

- **Depends on** B1.
- **Decision** none.
- **Migration** none.
- **Touches** `apps/web/src/lib/documents/` **(new)**,
  `apps/web/src/lib/storage/cloudinary.ts`,
  `apps/web/src/app/api/projects/[id]/documents/route.ts` **(new)**.
- **Rendering.** `apps/web` has **no PDF dependency today** — check
  `apps/web/package.json` before assuming otherwise. Add exactly one. The
  recommendation is `@react-pdf/renderer` in a Node-runtime route handler: it is
  deterministic, needs no headless browser, and will not add ~300MB of Chromium
  to an Azure container image. Do **not** reach for Puppeteer/Playwright here.
  ```ts
  export const runtime = 'nodejs';   // required — this is not Edge-safe
  ```
- **Contract**
  ```
  POST /api/projects/[id]/documents   { kind: 'receipt' | 'proforma' }
    → { document: { id, kind, number, file_url, issued_at } }
  GET  /api/projects/[id]/documents
    → { documents: [...] }            // note the envelope: `documents`, plural
  ```
  Both participants may generate and both may download the same document.
  Rate-limited (`documents:issue`, 10/min per user). Issuing is idempotent per
  `(project_id, kind, payment set)` — a second POST returns the existing row
  rather than burning a number.
- **Rules from the scope doc, restated as code requirements**
  - **Pulls, never asks.** No field on the document comes from the request body.
    The route takes `kind` and the project id. Everything else is read from
    `campaign_projects`, `project_proposals` and the payment ledger.
  - **Reflects reality.** A project with no confirmed payment produces a
    `proforma`, watermarked *not a receipt*. Only a gateway-confirmed payment
    appears as received — read the ledger's verified `paid` status, never
    `budget`.
- **Done when** both sides of a completed project download a byte-identical PDF,
  twice, and it matches the ledger.

---

### B3 · Documents in the product

- **Depends on** B2.
- **Touches** the project detail page (web), `apps/mobile/app/projects/`,
  the completion flow, `apps/web/src/lib/email/` templates.
- **What ships**
  - A Documents section on every project, both roles.
  - For a **short-term** project, the receipt is offered automatically at
    completion — that is the reason B was pulled forward from R2.
  - The completion notification links to it. Use an existing email template if
    one fits; do not add a template without adding its kill switch.
- **Done when** a short project completing produces a receipt without anyone
  asking for one, on web and mobile.

---

### B4 · Tax invoice layer — **conditional**

- **Depends on** B2, and on **Q1 being answered**. If it is not answered when
  B3 lands, this moves to R2 and nothing is blocked. Say so out loud rather than
  leaving it open.
- **Migration** `122_invoice_series.sql` — a counter table plus an allocation
  function taking a transaction-scoped advisory lock, so the series is
  **gapless** under concurrency. A `SEQUENCE` is not sufficient: sequences skip
  on rollback, and a tax series with holes is the problem this task exists to
  avoid.
- **Extra fields** supplier and recipient GST details, place of supply, tax
  breakdown, HSN/SAC. Same generator, different header and different totals
  block.
- **Invariant** once issued, cancel-and-reissue only. Never edit.

---

## 5. Lane 2 · Item C — Open campaigns

This is the business-owner side and the one structural gap in the product. It is
independent of Lane 1 and can be built in parallel from day one.

### C1 · Campaign schema and publishing

- **Depends on** nothing.
- **Decision** **Q5 — who moderates campaigns?** Pre-moderation needs someone
  doing it every day. **Build the state column with both states in it
  (`pending_review` and `live`) and a settings flag that decides which one a new
  campaign lands in.** Then the answer is an operational switch, not a rebuild,
  and C1 is not blocked.
- **Migration** `123_campaigns.sql`.
  ```sql
  CREATE TABLE public.campaigns (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title            text NOT NULL,
    description      text NOT NULL DEFAULT '',
    deliverables     text NOT NULL DEFAULT '',
    platforms        text[] NOT NULL DEFAULT '{}',   -- keys from lib/social/ registry
    budget_min       numeric,
    budget_max       numeric,
    currency         text NOT NULL DEFAULT 'INR',
    starts_on        date,
    delivery_by      date,
    applications_close_at timestamptz,
    -- who it suits
    follower_min     integer,
    follower_max     integer,
    categories       text[] NOT NULL DEFAULT '{}',
    location         text,
    status           text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_review','live','closed','expired','removed')),
    published_at     timestamptz,
    expires_at       timestamptz,
    removed_reason   text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
  );
  ```
  RLS:
  - SELECT `live` (and not expired) to any authenticated user;
  - SELECT own rows in any state to the owning business;
  - INSERT/UPDATE only by the owner, and **only if that business is approved** —
    reuse the existing approval gate, do not re-implement the check. The gate
    lives server-side on `POST /api/collabs` today; the campaign version needs
    the same test and deserves a shared helper.
- **Touches** `apps/web/src/app/api/campaigns/route.ts` **(new)**,
  `apps/web/src/app/api/campaigns/[id]/route.ts` **(new)**,
  `apps/web/src/lib/social/` (platform keys), the business dashboard.
- **Contract** `{ campaigns }` on list, `{ campaign }` on single. Write it in
  the route's header comment; the envelope-per-route trap has produced false
  audit findings here before.
- **Invariants** only an **approved** business can publish. A brief below the
  minimum standard (C5) cannot reach `live`.
- **Done when** an approved business creates, edits, publishes and closes a
  campaign from the dashboard, and an unapproved one is refused server-side.

---

### C2 · The campaigns board

- **Depends on** C1.
- **Touches** `apps/web/src/app/dashboard/campaigns/` **(new)**,
  `apps/mobile/app/campaigns/` **(new)**,
  `apps/web/src/app/api/campaigns/route.ts` (the GET),
  `apps/web/src/app/api/discover/route.ts` (read it — reuse its filter
  vocabulary rather than inventing a second one).
- **What ships** a browsable, filterable list of live campaigns, plus a
  personalised **For you** view matching the creator's own connected platforms
  and audience size. Sort by newest and by closing soonest.
- **Invariants**
  - Blocked accounts do not see each other's campaigns. `public.user_blocks` is
    enforced server-side elsewhere; enforce it here too, in the query.
  - Expired campaigns fall off the board without a cron: filter on
    `expires_at > now()` in the query. A scheduled sweep to set `status`
    is a nicety, not the mechanism.
- **Done when** a creator with no active project opens the app and has something
  to do. That is the entire point of item C.

---

### C3 · Applications

- **Depends on** C2.
- **Decision** **Q6 — does an application count against the free conversion
  cap?** The recommendation in the scope doc is **no**, and the code already
  agrees: the cap is a `BEFORE INSERT` trigger on `campaign_projects`, and an
  application creates no project. So the default behaviour is already correct —
  **the task is to write the test that pins it**, not to add anything.
- **Migration** `124_campaign_applications.sql`.
  ```sql
  CREATE TABLE public.campaign_applications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id     uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    creator_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    pitch           text NOT NULL,
    proposed_rate   numeric,
    status          text NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied','shortlisted','accepted','declined','withdrawn')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    UNIQUE (campaign_id, creator_user_id)
  );
  ```
  RLS: the applicant reads and writes their own row; the campaign owner reads
  all rows for their campaign and may change `status`. Nobody else sees
  anything — an applicant must not be able to enumerate who else applied.
- **Contract**
  ```
  POST /api/campaigns/[id]/applications   → { application }
  GET  /api/campaigns/[id]/applications   → { applications }   // owner only
  PATCH /api/campaigns/[id]/applications/[appId]
        { action: 'shortlist' | 'decline' | 'withdraw' }
  ```
  Rate-limited per creator per week (C6 supplies the number).
- **Invariants** applying starts nothing and commits nobody. No conversation, no
  request, no project, no notification to anyone but the brand.
- **Done when** a creator applies, the brand sees the applicant beside their
  real profile data — audience, verification, past collaborations, rating — and
  the applicant cannot see any other applicant.

---

### C4 · The hand-off — accepting an application

**This is the only task in Lane 2 that touches Lane 1 code. Read this section
twice.**

- **Depends on** C3.
- **Migration** `125_accept_campaign_application.sql`.
- **The constraint that dictates the design.** `project_proposals.collab_request_id`
  is `NOT NULL` and references `collab_requests`. The entire terms → project
  flow hangs off a collab request. So accepting a campaign application **must
  materialise a `collab_requests` row** in `status='accepted'`, or the brand and
  creator will land in a conversation where "propose terms" cannot work.

  There is also a `UNIQUE` partial index `collab_requests_one_pending_per_pair`
  on `(from_user_id, to_user_id) WHERE status = 'pending'` — accepting into
  `'accepted'` directly sidesteps it, but a pre-existing pending request between
  the same pair must be handled rather than collided with.

- **What the RPC does**, in one transaction:
  1. assert the caller owns the campaign and the campaign is `live`;
  2. assert the application is `applied` or `shortlisted`;
  3. upsert a `collab_requests` row (brand → creator) at `status='accepted'`,
     carrying the campaign title as the message and the proposed rate as the
     budget;
  4. call the existing `get_or_create_conversation()` (migration 043);
  5. set the application to `accepted`;
  6. return `{ conversation_id, collab_request_id }`.
- **Invariants**
  - Everything downstream is the flow that already works. **Do not add a second
    route to project creation.** The campaign feature ends where the deal
    begins.
  - Accepting an application still does not create a project, and still does not
    consume a conversion. The brand and creator negotiate first, exactly as they
    do from a direct request.
  - The business approval gate and the creator's ownership gate both still apply
    downstream, untouched.
- **Done when** an accepted application drops both parties into a normal chat
  with a working "propose terms" button, and the resulting project is
  indistinguishable from one that started as a direct request.

---

### C5 · Spam controls — **part of the feature, not a follow-up**

- **Depends on** C1 (build alongside; do not let `live` exist without these).
- **Why now.** Today a brand can approach one creator at a time, and that limit
  is the only thing keeping the platform quiet. An open board removes it by
  design. The realistic risk is approved brands being careless, not bad actors
  getting in.
- **What ships**
  - **A minimum standard for a brief** — title, description, deliverables, at
    least one platform, and either a budget or an explicit "budget on
    application". Enforced on the transition to `live`, not on `draft`.
  - **A cap on live campaigns per brand** (number from C6).
  - **Expiry** — `expires_at` required at publish, defaulted sensibly, and the
    board filters on it.
  - **Report a campaign** — reuse `POST /api/reports` and the existing admin
    moderation queue. Add the campaign subject type; do not build a second
    queue.
  - **Admin visibility** — campaigns list, filter by state, force-remove with a
    reason, under `apps/web/src/app/dashboard/admin/`. Every admin action goes
    through the existing admin audit log.
- **Done when** an admin can see and remove every campaign on the platform, and
  a brand cannot publish an empty brief or a twentieth live campaign.

---

### C6 · Campaign limits, free vs Pro

- **Depends on** C5.
- **Decision** **Q4 — the actual numbers.** Needed to *populate* the settings,
  not to build the mechanism. Ship with conservative defaults and change them
  with an UPDATE.
- **Migration** `126_campaign_limits.sql` — add to `billing_settings`:
  `free_live_campaigns`, `free_applications_per_week`, `campaign_default_days`.
- **Touches** `packages/core/src/entitlements.ts` — add
  `'campaigns.publish'` and `'campaigns.apply'` to `GATED_FEATURES`, and the
  matching `limits` / `freeLimits` keys to the `Entitlements` interface.
- **The rule this module already states, restated because it is easy to break:**
  `packages/core` carries **names and types only, never numbers**. The numbers
  live in `billing_settings`. Do not hard-code a campaign cap in TypeScript, and
  do not add a feature key unless the **server** enforces it.
- **Invariants** subscriptions stay **off**. `SUBSCRIPTIONS_ENABLED` is a
  commercial decision and a separate release. Free limits still apply while it
  is off — that is what `free_*` means.
- **Done when** the caps are enforced server-side, read from settings, and
  changeable without a deploy.

---

## 6. Lane 3 · Items D–H — the five smaller features

No dependencies on anything above. Any order, anyone free.

### S1 · Creator level & progress — *Low*
Tiers derived from audience size with a progress bar to the next one. The
follower data is already collected and refreshed; **nothing new needs storing**
— derive it. Put the tier function in `packages/core` so web and mobile cannot
disagree about where a boundary sits.
**Invariant:** compute on **verified** figures where they exist and mark the tier
clearly as self-reported where they do not. A public badge is an incentive to
inflate, and this codebase has already had to lock down a self-awarded verified
badge once (migration 083).

### S2 · Creating since — *Low*
Migration `128`: one nullable `smallint` on `profiles`, one optional signup
question, one profile line. Validate the range server-side (not before ~1990,
not in the future). Web + mobile signup + edit profile.

### S3 · Favourites & saved — *Low*
Migration `127`: one polymorphic `saved_items` table
(`user_id`, `kind` in `('creator','campaign')`, `target_id text`,
`UNIQUE(user_id, kind, target_id)`), RLS self-scoped. Brands save creators;
creators save campaigns once C2 exists. `free_shortlist_size` already exists in
`billing_settings` — wire the cap to it rather than adding a number.

### S4 · Networking funnel — *Low*
`get_collaboration_stats()` (migration 113) already returns `partners_total`,
`projects_total`, `projects_active`, `projects_completed`, `projects_cancelled`,
`requests_accepted`, `first_collab_at`, `last_collab_at` from real records.
**No migration needed** unless "requests sent" is missing — check first, and if
it is, extend that function rather than writing a new one. This task is a
screen, not a backend.
**Invariant:** the meters are structurally different per role. Do not present a
brand's funnel to a creator and call the zeroes a bug.

### S5 · Reviews & reputation — *Medium*
Reviews already work end to end, restricted to the two people who completed a
project together (`apps/web/src/app/api/projects/[id]/reviews/route.ts`).
Three additions, migration `129`:
1. **Ask at the right moment** — prompt on completion rather than hoping someone
   remembers. Reuse the notification pipeline; add the kill switch.
2. **Criteria-level scoring** — separate scores instead of one star. Keep the
   existing `rating` column as the derived average so every profile that reads
   it today keeps working.
3. **Creators rate brands** — reputation that runs one way is worth much less to
   the side being judged. The existing route already checks *participation*, not
   role, so verify what actually blocks this before assuming it is a big change.

---

## 7. Decisions blocking work

Six open questions from §8 of the scope document, mapped to what they actually
stop. Four of the six do **not** block the start of any task, which is the point
of the ordering above.

| # | Question | Blocks | Owner | If unanswered |
|---|---|---|---|---|
| Q1 | Tax invoice or receipt? Who is the supplier? | **B4 only** | accounts | Ship the receipt (B1–B3). B4 moves to R2 |
| Q2 | Does a short-term project allow an advance? | **A2** | product | **Genuinely blocking.** Build single-payment; a third step changes the flow tables |
| Q3 | Can a short project become a full one? | A1 trigger | product | Recommendation: **no**. Encoded as an immutability trigger in 119 |
| Q4 | Campaign limits — how many, how long? | C6 values | product | Ship conservative defaults in settings; change with an UPDATE |
| Q5 | Who moderates campaigns? | C1 default state | ops | Build both states + a flag. Not blocking |
| Q6 | Does an application count against the conversion cap? | C3 test | product | Recommendation: **no**, and the code already behaves that way. Pin it with a test |

Answers go in `docs/product/DECISIONS.md` with the date, so they are not
re-litigated mid-build.

---

## 8. Invariants for the whole release

Every one of these has already been a bug in this codebase, or is one step away
from being one. They belong in the e2e suite, not in a reviewer's memory.

1. **A project is created only by accepting a proposal.** There is no
   `POST /api/projects` and adding one is not a shortcut. Campaign acceptance
   (C4) rejoins this flow; it does not bypass it.
2. **No unilateral close, ever.** `confirm_completion` is the only door to
   `project_completed`, on every flow, and it takes both sides. That class of
   bug has been closed twice here.
3. **No unilateral money.** A payment gate opens only on a signature-verified
   capture when Razorpay is configured. Barter (A4) is the single exception and
   it is gated on an immutable flag agreed at creation.
4. **Amounts are derived server-side.** Never from the request body, on any new
   route, including document generation.
5. **`stage_progress` is written only by `record_stage_signoff()` /
   `revoke_stage_signoff()`.** Never read-modify-write it from application code;
   the second concurrent write clobbers the first and the trigger rejects it as
   a 500 with the user's click lost.
6. **The checklist gate fails closed on `[]`, open only on `null`.** Add the new
   short-flow stage keys to `stageHasRequiredItems()` or you re-open the
   2026-08-08 hole for the new flow.
7. **`packages/core` carries names and types, never numbers.** Limits live in
   `billing_settings`.
8. **Every new route declares its envelope in a header comment.** There is no
   shared envelope in this codebase and guessing produces empty arrays that make
   tests pass and dashboards render blank.
9. **Mobile ships in the same task as web.** And `LAST_COMMIT_TIME` gets bumped.
10. **`NEXT_PUBLIC_*` is frozen at build time.** Anything R1 adds that must be
    changeable at runtime is served from an endpoint, the way
    `/api/auth/config` already does.

---

## 9. Outside R1, but ahead of it

Neither is a feature and neither belongs in this scope, but neither should be
discovered after R1 is declared done.

- **X1 · Email confirmation is off.** Signup never verifies the address. It is a
  Supabase settings toggle, not a build. It has been a standing pre-launch
  blocker since 2026-08-02.
- **X2 · There is no production tier.** `main` does not exist on `origin`,
  `deploy-prod.yml` has never fired, and what is named "production" in the
  configuration points at the **staging** Supabase project
  (`aokdansyqxracuwsosji`). The mobile `production` EAS profile points at
  staging too. See `docs/operations/HANDOVER.md` P0.1 / P0.2.

Also parked deliberately, so they are not re-litigated mid-build: trending topics
(needs a paid data source — a purchasing decision first), games and quizzes
(dropped), and turning subscriptions on (a commercial decision, separate
release).

---

## 10. Progress

Tick as each task merges to `dev`.

**Lane 1 — the deal**
- [x] A1 Flow foundation · `119`
- [x] A2 Choosing the kind at proposal time · *blocked on Q2*
- [x] A3 Short-term stage machine
- [ ] A4 Single payment gate + barter · `120` *(guard trigger)*
- [ ] A5 Short-term UI, web + mobile
- [ ] B1 Document store · `121`
- [ ] B2 Generator
- [ ] B3 Documents in the product
- [ ] B4 Tax invoice layer · `122` · *conditional on Q1*

**Lane 2 — the business-owner side**
- [ ] C1 Campaign schema and publishing · `123`
- [ ] C2 The campaigns board
- [ ] C3 Applications · `124`
- [ ] C4 The hand-off — accepting an application · `125`
- [ ] C5 Spam controls
- [ ] C6 Campaign limits · `126`

**Lane 3 — the five smaller features**
- [ ] S1 Creator level & progress
- [ ] S2 Creating since · `128`
- [ ] S3 Favourites & saved · `127`
- [ ] S4 Networking funnel
- [ ] S5 Reviews & reputation · `129`

**Ahead of the release**
- [ ] X1 Turn on email confirmation
- [ ] X2 Create a real production tier
