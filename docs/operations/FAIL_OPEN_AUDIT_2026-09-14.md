# Fail-open audit — every degradation path, decided deliberately

Date: 2026-09-14 · Block 1.5 of
[PRODUCTION_READINESS_CHECKLIST_2026-09-14.md](PRODUCTION_READINESS_CHECKLIST_2026-09-14.md)

AGENTS.md warns that several places degrade gracefully "in case the migration
isn't applied", that this is **correct for a missing table and wrong for zero
rows**, and that conflating the two caused the worst bug in the 2026-08-08
audit. The hosted database has been current since then, so every remaining
guard protects a state that no longer occurs.

This is the pass that decided each one. **The finding is that they are already
correct** — the codebase distinguishes the two cases better than the checklist
assumed. What was missing was the record, so the next person doesn't have to
re-derive it (or "tidy up" a guard that is load-bearing).

## The rule

| Situation | Correct behaviour | Why |
|---|---|---|
| Object missing (table/RPC/column absent) | **Degrade** | Migration lag is an infrastructure state, not a user state. Blank panel beats a 500. |
| Object present, zero rows, on something that *should* have rows | **Fail closed** | This is the vacuous-gate bug. An empty checklist is not an unblocked one. |
| Read genuinely failed (timeout, connection reset) | **Depends on what it guards** — see below | |

For the third row the deciding question is: *what does an error cost in each
direction?*

- **Display** → fail open. A missing reach figure is a worse experience; a 500
  is a worse experience and tells the user nothing.
- **Money, permission, or identity** → fail closed. A paying brand briefly
  losing Pro is a support ticket. A free account silently gaining it is an
  invisible, unbounded leak.

## Every guard, and its verdict

### Correctly fail-closed — do not "simplify" these

| Guard | Behaviour | Verdict |
|---|---|---|
| `lib/stage-items-gate.ts` | `null` = unreadable → degrade; `[]` on a stage that should have items → **blocked** | ✅ This is the fix for the 2026-08-08 vacuous-gate bug. The distinction is the whole point of the file. |
| `resolveEntitlements` | Lookup error → **free tier**, not Pro | ✅ Tested explicitly. Deliberately the opposite of the rate limiter, and the test says so. |
| `enforce_project_consent` (DB trigger) | Rejects a write that would clobber a co-signature | ✅ Enforced in Postgres, not application code — cannot be bypassed by a new route. |
| Payment gates | Open only on a signed webhook; amounts derived server-side | ✅ No client-supplied figures anywhere in the money path. |
| `payments:create` rate limit | `strict: true` → fails **closed** if Upstash is unreachable | ✅ Added 2026-09-14. See the commit for why money differs from abuse guards. |
| Vendor kill switches | Absent row → vendor **ON** | ✅ Inverted on purpose. A missing row must never silently disable payments. Product flags keep the opposite default. |

### Correctly fail-open — display only

| Guard | Degrades to | Verdict |
|---|---|---|
| `get-reviews.ts` (missing RPC) | No reviews section | ✅ Display. |
| `profile-reach.ts` (`42703`, migration 116 columns) | No reach figure | ✅ Display. |
| `/api/activity` (migration 073) | Empty feed | ✅ Display. |
| `/api/admin/emails` (migration 100) | `null` → UI says "not applied yet" | ✅ Better than fail-open: it *names* the cause. |
| `/api/admin/analytics` (migration 098) | Empty funnel | ✅ Display. |
| `profile-visibility-editor` (migration 088) | Renders nothing rather than a broken control | ✅ Display. |
| `conversations/[id]/deal` (migration 071) | `null` deal | ✅ Display. |
| `influencer/dashboard` (migration 074) | `undefined`, distinct from `false` | ✅ Deliberately three-valued. |
| `feature-flags.ts` (missing table) | Env fallback | ✅ Pre-migration behaviour, which is a known-good state. |
| `lib/rate-limit.ts` (non-strict) | In-process counter | ✅ Cost control, not auth. Locking every user out over an Upstash blip is worse. |

### One deliberate non-fail-open worth noting

`signup/influencer` account checks: a private or not-found account still
**blocks**. The comment there already says so. Correct — this one is identity,
not display.

## What changed as a result of this pass

Only one thing: `payments:create` now fails closed when a distributed limiter
is configured but unreachable. Everything else was already right and is now
written down.

## The standing rule for new code

> A guard that degrades must say, in a comment, **which of the three
> situations it is handling**. "Might not be applied" is not sufficient — it
> is exactly the ambiguity that produced the vacuous gate.
