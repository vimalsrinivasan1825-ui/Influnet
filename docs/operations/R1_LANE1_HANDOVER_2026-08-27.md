# Release 1, Lane 1 — Review & Handover

**For the developer picking this up.** Reviewed 27 August 2026 against `dev` at
`e89fdf98`. Companion to [the build plan](../product/RELEASE_1_BUILD_PLAN.md);
task IDs (A1–A5, B1–B4, C1–C6) refer to it.

---

## Verdict

**The approach is right and the architecture is sound. Nothing works end to end
yet.**

Tasks A1 through A4 are marked complete in the build plan. They are
**code-complete, not done**: the three migrations they depend on have never been
applied to any database, and the project route cannot see which flow a project
is on. Treat A1–A4 as written-but-unverified and re-tick them only after the two
blockers below are closed and an end-to-end run proves it.

There is also a **regression to existing behaviour on `dev` right now** — see
Blocker 1. Fix that first, before anything else.

### What was done well

Worth saying, because it means the direction does not need changing:

- **The table-driven refactor is the correct architecture and was executed
  properly.** `STAGE_FLOWS` + `flowOf()`, with `STAGES` / `ALLOWED_TRANSITIONS`
  kept as `STAGE_FLOWS.full.*` aliases. No second state machine was built, which
  was the single biggest risk in the whole release.
- **The 1,140-line project route was genuinely migrated.** Every branch —
  advance, signoff, skip, confirm_completion, update_stage — reads `flow.stages`,
  `flow.transitions`, `flow.actor`, `flow.labels`. That is real work and it was
  done thoroughly.
- **Migration 120 is well judged.** A deferred constraint trigger, keyed off the
  *stored* `is_barter` flag rather than "the amount happens to be zero", firing
  only on the transition into `project_completed`. That is exactly the guard the
  plan asked for, and it is the reason Blocker 4 is a correctness bug and not a
  money hole.
- **Validation is defence in depth.** Short-flow rules (needs a due date, needs
  budget-or-barter, no advance, barter forces zero budget) are enforced in the
  route *and* again in the RPC.
- **Payments stayed safe.** The amount is still derived server-side; a barter
  project cannot create an order because `rupees <= 0` is rejected.
- **Mobile was carried along in the same commits.** The parity discipline held.
- `isMutualSignoffStage`'s guard against `.filter()` passing an array index as
  the second argument is a sharp catch.

---

## Blockers — fix in this order

### 1 · The migrations are not applied, and the code already assumes them

**Severity: blocker. This has broken existing behaviour, not just new
behaviour.**

Verified live against the dev database:

| Expected | Actual |
|---|---|
| `campaign_projects.flow_key`, `.is_barter`, `.barter_details` | **absent** |
| `project_proposals` — all five new columns | **absent** |
| `trg_prevent_flow_immutable`, `trg_short_payment_guard` | **neither exists** |
| `propose_project(...12 args)` | still the old **7-arg** signature |
| `respond_to_proposal(...)` | still the old **3-arg** signature |

So migrations **119, 120 and 130 have never run**.

Meanwhile `apps/web/src/app/api/conversations/[id]/deal/route.ts` now calls
`supabase.rpc('propose_project', { p_flow_key, p_deliverables, p_start_date,
p_is_barter, p_barter_details, ... })`. PostgREST resolves functions by argument
name, so it cannot find a function with those names — **proposing terms fails for
every project on dev, full-flow included.**

```bash
node scripts/apply-migration.mjs 119 && node scripts/apply-migration.mjs 120 && node scripts/apply-migration.mjs 130
```

Then re-verify the four rows in the table above before writing any more code.

> Note: `deliverables` and `start_date` already existed on `campaign_projects`
> since migration 020, so 119's `ADD COLUMN IF NOT EXISTS` for those two is a
> no-op there. Harmless, but do not be misled by seeing them present into
> thinking 119 ran — check `flow_key`.

---

### 2 · `flowOf()` returns the full flow for every project

**Severity: blocker. One-line fix, total impact.**

`apps/web/src/app/api/projects/[id]/route.ts:111`

```ts
.select('id, title, owner_user_id, counterparty_user_id, current_stage, stage_progress')
```

`flow_key` is not in the select. Line 125 then does `flowOf(project)` on a row
that has no `flow_key`, so it falls back to `'full'` — **always**, for every
project, on every action.

Everything downstream is correctly flow-aware. It is all being handed the wrong
flow. What that actually does to a short-term project:

- **`advance` and `signoff` both fail.** `FULL_TRANSITIONS` has no
  `quick_agreement` key, so `flow.transitions[currentStage]` is empty and
  `flow.stages.indexOf('quick_agreement')` is `-1` → "Invalid current stage".
- **`confirm_completion` refuses.** `terminalStage` is computed as
  `final_payment`, so a short project sitting on `quick_payment` gets
  *"Completion can only be confirmed at the terminal payment stage"*.
- **Short stages become skippable.** The full flow's `nonSkippableStages` does
  not list `quick_*`, so `propose_skip` is allowed on all three — directly
  violating the plan's invariant that a short project has nothing to skip.
- **The fail-closed checklist guard goes quiet.**
  `stageHasRequiredItems('quick_payment', fullFlow)` is `false`, so an empty
  checklist on a short stage reads as "nothing pending" instead of failing
  closed. That is the 2026-08-08 bug reopened for the new flow.

**Fix:** add `flow_key, is_barter` to that select. Add `is_barter` too — the
completion branch will want it and it is cheaper than a second read.

---

### 3 · The checklist endpoint seeds the wrong stages

**Severity: high. Can permanently brick a short-term project.**

`apps/web/src/app/api/projects/[id]/stage-items/route.ts:38`

```ts
const items = await ensureStageItems(supabase, projectId);   // no flow
```

The deal route seeds correctly at creation (`deal/route.ts:431`, with
`projectFlow`), but that seed is deliberately non-fatal — *"the gate will retry"*.
If it fails, the first `GET` of the checklist seeds **all twelve full-flow
stages** onto a short project. `ensureStageItems` then returns early forever
because rows exist, so the short stages are never seeded, and `evaluateStageGate`
fails closed on `quick_agreement` with `reason: 'not_seeded'`. The project can
never move again.

**Fix:** read the project's `flow_key` in this route and pass `flowOf(project)`
through. While you are there, consider whether `ensureStageItems` should take the
flow as a required argument rather than an optional one — every current bug in
this list is an optional flow argument that someone did not pass.

---

### 4 · `short_pay_before` checks the wrong stage at completion

**Severity: high (correctness), not a money hole.**

`route.ts:659`

```ts
const completedIdx = flow.stages.indexOf('project_completed');
const terminalStage = completedIdx > 0 ? flow.stages[completedIdx - 1] : null;
// comment says: "the stage just before project_completed is the terminal payment stage"
```

That holds for `full` (`final_payment`) and `short_pay_after` (`quick_payment`).
It is false for `short_pay_before`, whose order is
`quick_agreement → quick_payment → quick_delivery → project_completed` — the
stage before completion is **delivery**. So the creator-side money check at
completion evaluates the *delivery* checklist.

Migration 120's trigger still refuses to complete a non-barter short project with
no confirmed payment, so no money can be walked past. But the route-level check
is now checking something other than what its comment claims.

**Fix:** derive the payment stage by name (the stage whose checklist carries the
`is_gate` payment item), not by position. Then correct the comment.

---

## Should fix before moving on

### 5 · Migration 130 left the reserved band

A2's RPC changes went into `130_proposal_flow_fields.sql`, skipping **121–129**,
which the build plan reserves for B1, B4, C1, C3, C4, C6, S3, S2 and S5.

Nothing collides today. The trap is a fresh rebuild: `supabase db push
--include-all` applies in filename order, so 121–129 would run **before** 130 —
and any of them that assumes the new `propose_project` / `respond_to_proposal`
signature breaks on a clean database while working fine on dev.

**130 has never been applied anywhere, so renaming it is free right now, and
stops being free the moment it lands on any database.** Rename it to
`121_proposal_flow_fields.sql` and shift the plan's reservations by one
(B1→122 … S5→130). Ten minutes now, or a confusing rebuild failure in a month.

### 6 · There is no end-to-end test for any of this

453 unit tests pass, including 15 new and well-aimed ones — they even cover the
empty-checklist fail-closed case. But every one is a pure-function test, and
**both blockers above live in the wiring between the route and the database**,
which no pure-function test can see. `grep -rl "flow_key" tests/` returns
nothing.

This is the systemic finding, not an item on a list: step 7 of the task loop asks
for an API-level phase driving two real accounts, and skipping it is why four
tasks were marked complete while the feature could not run at all.

**Write `tests/e2e/phase8-short-projects.mjs` before A5.** It should:

1. propose short-term terms, accept them, assert `flow_key` and
   `current_stage = 'quick_agreement'` on the row;
2. assert the checklist has **3 stages, not 12**;
3. sign off each stage from both sides and assert one-sided attempts are refused;
4. assert `propose_skip` is **rejected** on every short stage;
5. drive a real test-mode payment through `quick_payment`;
6. assert a non-barter short project **cannot** reach `project_completed` with an
   empty ledger (this is the 120 trigger — prove it fires);
7. run the same path for `short_pay_before`;
8. run a barter project through and assert it completes with a zero-value record.

Turn `NOTIFY_EMAILS_ENABLED` off before the run and restore it after — the
personas use `@influnet-audit.test`, which hard-bounces.

---

## Smaller things

| | Where | What |
|---|---|---|
| 7 | `apps/web/src/components/dashboard/deal-panel.tsx` | **The working tree does not compile.** `className={}` at line 685, JSX structure errors at 756 and 795. `HEAD` typechecks clean — verified — so this is uncommitted A5 work in progress. Also: the kind selector offers only `full` and `short_pay_after`; **`short_pay_before` exists in the backend and is unreachable from the UI.** |
| 8 | `packages/core/src/project-lifecycle.ts`, above `SHORT_NON_SIGNOFF` | The comment says *"all short stages except project_completed are non-signoff"*. The code says the opposite — and **the code is right**: all three quick stages use mutual sign-off. Fix the comment before someone trusts it. |
| 9 | `apps/mobile/lib/build-info.ts` | `LAST_COMMIT_TIME` was not bumped, though A1 changed five mobile files. |
| 10 | `supabase/migrations/119_project_flows.sql` | The immutability trigger has no `WHEN` clause, so it fires on every update of every project. Cheap, but `WHEN (OLD.flow_key IS DISTINCT FROM NEW.flow_key OR OLD.is_barter IS DISTINCT FROM NEW.is_barter)` costs nothing and documents intent. |

---

## A5 is bigger than it looks

The A1 commit message says *"nothing reads STAGES directly"*. That is true of
`packages/core` and the API route. It is **not** true of the applications, and
this is the bulk of what A5 still has to do. Everything below is still full-flow
only, and will misrender or misbehave on a short project:

| File | What breaks |
|---|---|
| `apps/web/src/app/dashboard/projects/page.tsx` | Its **own hardcoded 12-stage array** (line 23) plus `STAGE_ACTOR`. A short project shows the wrong label and a 12-segment progress bar with nothing current |
| `apps/web/src/app/dashboard/projects/[id]/page.tsx` | `ALLOWED_TRANSITIONS[currentStage]` and `STAGE_ACTOR[currentStage]` → empty/undefined, so the action buttons are wrong or missing. **This is the main project screen** |
| `apps/web/src/components/dashboard/project-flow.tsx` | Renders the pipeline from `STAGES` unconditionally — 12 nodes, none current |
| `apps/web/src/app/api/home/route.ts` | `phaseOf(p.current_stage)` with no flow → `null` for `quick_*`, so **short projects fall out of every phase bucket on Home** |
| `apps/web/src/app/dashboard/home/page.tsx` | `STAGE_LABELS[...]` → raw key, e.g. "quick_delivery" |
| `apps/mobile/app/projects/deleted.tsx` | `STAGES.indexOf(...)` → `-1` → "step 0 of 12" |
| `apps/web/src/lib/email/templates.ts` | Local `STAGE_LABELS` copy → stage emails say "quick_delivery" |
| `dashboard/admin/projects/page.tsx`, `dashboard/admin/users/[id]/page.tsx` | Local `STAGE_LABELS` copies → admin shows raw keys |

Mobile is in better shape: `(tabs)/projects.tsx`, `(tabs)/home.tsx`,
`projects/[id]/index.tsx` and `projects/[id]/stage/[stage].tsx` already call
`flowOf()`, and `STAGE_GUIDE` covers all three quick stages.

**Suggestion:** the four local `STAGE_LABELS` copies are the real problem — they
were already duplicated before this work and they will drift again. Export one
flow-agnostic `labelForStage(stageKey)` from `packages/core` that looks across
every flow, and delete the copies.

---

## Do this, in this order

1. **Apply 119, 120, 130** and verify the columns, triggers and RPC signatures.
   Nothing else is testable until this is done, and terms proposals are broken on
   dev until it is. *(Blocker 1)*
2. **Add `flow_key, is_barter` to the select at `route.ts:111`.** *(Blocker 2)*
3. **Pass the flow into `ensureStageItems` in the stage-items route.**
   *(Blocker 3)*
4. **Rename 130 → 121** and shift the plan's reservations, while it is still
   free. *(Item 5)*
5. **Write `tests/e2e/phase8-short-projects.mjs`** and make it pass. Only then
   re-tick A1–A4. *(Item 6)*
6. **Fix the terminal-stage derivation** for `short_pay_before`. *(Blocker 4)*
7. **Finish A5** — the working tree first (it does not compile), then the eight
   files in the table above, then `short_pay_before` in the UI, then bump
   `LAST_COMMIT_TIME`.
8. Then B1 — the document store — as planned.

Lane 2 (open campaigns, C1–C6) is untouched and unblocked. If a second person is
free, they can start C1 today; it shares no code with any of the above.

---

## How this was verified

- `git log` / `git show` on `bc07bf93`, `9a284435`, `15ce33d8`, `e4ea5fd7`
- Read: `project-lifecycle.ts`, `project-stage-items.ts`, `stage-items-gate.ts`,
  `project-turn.ts`, `project-stage-guide.ts`, the project PATCH route, the deal
  route, the payments route, the payment webhook, migrations 119 / 120 / 130
- Live SQL against the dev database via the Supabase Management API
  (`tests/e2e/lib/sql.mjs`): column presence on both tables, `pg_trigger`,
  `pg_proc` signatures
- `npx tsc --noEmit` on `apps/web` (working tree: 2 errors; `HEAD`: clean) and on
  `apps/mobile` (clean)
- `npx vitest run tests/unit` — 453 passed, 38 files
- `grep` sweeps for `STAGES` / `ALLOWED_TRANSITIONS` / `STAGE_ACTOR` /
  `STAGE_LABELS` / `phaseOf` / `stageProgressPercent` across `apps/` and
  `packages/`

No files were modified during this review.
