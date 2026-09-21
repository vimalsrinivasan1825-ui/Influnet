# Launch-readiness audit — 2026-09-19

**Scope**: the user's question was *"can I hand this to real users and be confident
nothing breaks?"* This audit answers it three ways: what the code proves, what the
live E2E harness proved against the dev database today, and what remains open —
because "the product works" and "the launch works" are different lists.

**Benchmarks**: `docs/operations/launch-blueprint.html` (updated 19 Sep),
`HANDOVER.md` (verified 2026-08-12), `GO_LIVE_AUDIT_2026-09-17.md`,
`FULL_FLOW_AUDIT_2026-08-08.md`.

**Evidence provenance.** Everything below marked *checked* was run in this session
against the current `dev` HEAD (`993d1064`, clean tree, in sync with `origin/dev`):
typecheck, the full unit suite, and the E2E harness driven against the real dev
database (`jaajosocopoicmqcffuu`) through a locally booted web server with
`NOTIFY_EMAILS_ENABLED=false` and `BROADCAST_DRY_RUN=true` for the whole run.
Config items that live in GitHub/Azure/Supabase dashboards are marked *dashboard* —
they cannot be read from the repo and are as last measured 16–18 Sep per the
blueprint.

---

## Part 1 — The verdict

**The product is ready. The launch is not — and the gap is now entirely
configuration, promotion and paperwork, not code.**

If the dev → staging merge happened today, the app users get would be the one that
just passed 302/302 live E2E checks plus 727 unit tests. What would still go wrong
has nothing to do with the stage machine, login, payments, or authorization:

| # | Blocker | Owner | When |
|---|---------|-------|------|
| B1 | 156 commits sit on `dev`; production (`staging` branch) has none of it. Every fix this summer is invisible to users until the PR merges. | 👤 you | before any user touches it |
| B2 | The admin password committed in `2d91fb65` is still valid and public on GitHub. | 👤 you | today — 10 min |
| B3 | Legal pages are wired but filled with 24 `[[placeholders]]`; `TERMS_VERSION = '2026-09-draft-1'`. Razorpay and both stores require published, filled-in pages. | 👤 you + lawyer | weeks — start now |
| B4 | ~~The public repo tracks 3 data-dump JSONs~~ ✅ **Fixed 2026-09-19**: untracked from git (local copies kept) and an ignore rule added for `*-backup-*.json` / `*-dump-*.json`. The dumps contained only test/audit personas — no real user PII — but history still carries them until the next merge to production; purging history is optional and not worth the rewrite. | ✅ | done |
| B5 | Login and phone-OTP correctness on production depends on Supabase Auth dashboard state (Confirm email, Site URL, redirect list, 2Factor template). Not verifiable from the repo. | 👤 you | at Phase 1 |

Everything else the blueprint called "Phase 0" is done and verified in code: the
account-deletion cascade fix (F2, migration 161), the manual OTA gate (F3), Stream
deletion + support address (F6), the single-source notifications (F9/165), the
admin pagination fix (F11), and the health-sweep fix (F12).

---

## Part 2 — What the live E2E harness proved today (302/302)

Run in canonical order per `FULL_FLOW_AUDIT_2026-08-08.md`: seed → phase3 →
phase4 → phase5 → phase6, then the standalone verifiers.

| Suite | Result | What it actually proves |
|---|---|---|
| seed-personas | 12/12 | Personas created through the **real** signup endpoint, not DB inserts |
| Phase 3 — requests & concurrency | **44/44** | 5 brands → 1 creator simultaneously = 5 rows; 5 identical concurrent requests = 1 row + 4 clean 409s (DB constraint, not app check); block enforcement |
| Phase 4/5 — messaging & 12-stage machine | **49/49** | Conversation get-or-create race yields one row; non-participants walled off; revision loop re-enters correctly; revisions cannot be skipped; wrong actor refused |
| Phase 6/7 — payments & completion | **43/43** | Order amounts derived server-side; ₹1 against ₹200k refused; unsigned/corrupt/mis-signed webhooks all 401 and move nothing; replayed capture doesn't double-record; cancellation preserves the ledger |
| Phase 8/9 — admin & authz sweep | **86/86** | Admin routes refuse creators/businesses/anon; injection payloads harmless; malformed IDs → 4xx; 80-message burst rate-limited |
| Phase 9 — unproven units | **80/80** | Skip by mutual consent; every stage action notifies the other side exactly once; change requests; delete/restore; peer requests; pin caps (402 at the 4th, Free-plan aware) |
| Migration 161 (deletion survival) | **32/32** | A completed, paid project survives either party's account deletion; other party still opens the invoice; deleted token dead |
| Migration 164 (approval guards) | **11/11** | Direct PostgREST calls cannot bypass business approval; publishing a draft needs an approved business; awaiting-review may still send requests (by design) |
| Migration 165 (notifications) | **9/9** | Accepting an application notifies the applicant exactly once; brand notified not at all |
| Sign-off race (20 rounds) | **11/11** in every position tested — standalone, immediately after phase 4, and back-to-back with itself | The 2026-08-08 lost-update bug stays dead: every unthrottled round landed both signatures and advanced; revoke leaves the other side intact |

**Specifically on your two named worries:**

- **"The user is getting logged in using this application"** — login/signup is
  exercised end to end by every phase: personas authenticate through the real
  Supabase Auth with real JWTs on every call. The phone-OTP gate is read at
  runtime by both clients through `/api/auth/config` ← `feature_flags.phone_otp`
  (verified in code; runtime-flip tested by `verify-otp-flag-runtime.mjs`). The
  one caveat is B5: the production Auth dashboard settings are the piece this
  audit cannot see from the repo.
- **"Nothing will break on stages"** — this was the 2026-08-08 audit's headline
  bug (both payment gates stood open). It is fixed and now defended in depth:
  unsigned webhooks can't open money gates, zero checklist rows fail closed
  (migration 097 era fix, retained), unpaid projects block at `advance_payment`
  with a named blocking item ("Advance / deposit received" observed today), and
  20/20 simultaneous mutual sign-offs survive. The stage machine also grew since
  the docs were written: `STAGE_FLOWS` now carries `full` (12 stages) plus
  `short_pay_after` / `short_pay_before` quick deals, all table-driven through
  `flowOf()` with the same gate machinery.

**One harness-ordering note, fixed same-day:** phase 4 used to consume phase 3's
accepted requests and the race verifier used phase 4's project — running them
standalone produced failures that looked like product bugs (a 10/11 with a HIGH,
an 8/10 with two HIGHs). Both are fixed:

- **phase 4 now re-establishes its own fixtures** — any consumed business without
  an accepted request to Sourav gets one created *and accepted through the real
  API*, idempotently. Bare-seed → phase4 standalone: **54/54**.
- **the race verifier is now position-independent.** The project PATCH route is
  limited per user to 20 per aligned 60-second window (`projects:update`), and
  the 20-round burst is exactly that whole budget per side — so any inherited
  traffic (phase 4's 80-message flood) turned burst rounds into 429s (observed
  `[200,429]`, `[429,429]`), and a *clean* burst still spent the bucket so the
  sequential section's first PATCH was throttled, cascading into one CRITICAL,
  one HIGH and one MEDIUM that looked like a broken stage machine and were
  purely the limiter. The fix is window-discipline: each high-volume section
  waits out the current aligned window before it starts, and a 429 mid-burst
  voids that round and re-takes it whole in a fresh window (capped, so a
  permanently closed limiter still fails loudly). Proven green in all three
  positions: standalone, immediately after phase 4, and back-to-back with
  itself — **11/11** each.

Run the canonical order and everything is green either way; run a standalone
phase and it now works too.

---

## Part 3 — Code-level state, checked today

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 7/7 workspaces clean |
| Unit tests | ✅ 727 passed, 6 skipped (`tests/integration/api.test.ts`, skipped without live env) |
| Health probes | ✅ Now cover through migration **165** (the HANDOVER P0.11 gap is closed; probes are zero-arg RPC/table/column with the PGRST202 logic explained inline) |
| Response envelopes / table names | ✅ The AGENTS.md traps (`campaign_projects`, no `collaborations`, per-route envelopes) are respected in the audited routes |
| Column-grant discipline | ✅ `apps/web/tests/unit/column-grants.test.ts` exists and passes in the suite |
| Weekly health sweep | ✅ Probes **dev + production**, opens one rolling issue on failure; F12's "later steps always run" is fixed (commit 54eb68ed) |
| Production OTA job | ✅ Manual-only via `workflow_dispatch`, gated behind the `production` GitHub Environment (commit 7e710cb0) |
| `NEXT_PUBLIC_*` discipline | ✅ Runtime flags served via `/api/auth/config` + `feature_flags`; boot banner confirms |
| `feature_flags` rows on **dev** | ⚠️ Empty table — every flag resolves from env fallback. Fine, but know it: flipping `phone_otp` on the dashboard does nothing until a row exists or the env var is set. |
| Stage flows | ✅ `STAGE_FLOWS` (full + two short flows) table-driven; `ALLOWED_TRANSITIONS` exported for compat only |

### Known-accepted items (do NOT "fix" these)

- `public.connections` is dead (029). `get_collaboration_stats()` (113) is the counter source.
- A business awaiting review **may** send requests — July 2026 design decision, now DB-enforced correctly (164).
- Short-flow stages are all non-skippable by design (3 real stages; skipping one is skipping the project).
- `qacreator` on staging is load-bearing for deploy smoke tests.

---

## Part 4 — The remaining work, in order

Phase 0's code items are done. What's left is the blueprint's Phase 1–5, of which
the audit only re-confirms the order:

1. **B2 — rotate the admin password today** (it is in public git history; also
   remove the three tracked backup JSONs, B4).
2. **B1 — the dev → staging PR.** It carries migrations 148–165 to production's
   database. After merge: `/dashboard/admin/health` must show 0 pending, and
   `/legal/privacy` must 200. Do it after B2 and after the Auth settings (Phase 1
   of the blueprint) so Confirm-email is on before real signups land.
3. **Phase 1 (dashboard work)** — production Auth (Site URL → redirects →
   Confirm email ON → min password 8), Resend webhook secret, `CRON_SECRET`,
   Upstash/Sentry/PostHog keys, `BROADCAST_DRY_RUN=true` until you've sent one
   broadcast to yourself, `TWOFACTOR_TEMPLATE` so OTP SMS isn't silently a voice
   call.
4. **Phase 2 (legal/money)** — the 24 placeholders need a lawyer; live Razorpay
   keys + one real rupee through a real project; decide payouts mechanism; decide
   plans now (launch-free is the blueprint's recommendation — today
   `SUBSCRIPTIONS_ENABLED` is on in dev's env, so confirm what production gets).
5. **Phase 3 (stores)** — one native build carries everything; walk the push
   prompt on real hardware (the one thing never verified on a device); review
   accounts on production.
6. **Phase 4 (soft launch)** — 20–50 known creators, incident log from day one,
   and the 14-day public gate (crash-free ≥ 99.5%, captures ↔ gates matched, no
   Sentry issue > 5% of users).

---

## Part 5 — Answering the question as asked

> *"whether we have 100% confident on everything will work fine, nothing will
> break on stages kind of thing"*

- **Stages: yes, as confident as evidence allows.** The stage machine is the most
  tested subsystem in the repo (49 + 80 + 10 checks today, plus dedicated unit
  coverage) and every historically buggy path — the payment gates, the sign-off
  race, the revision loop, skip semantics — is now covered by a test that fails
  if it comes back.
- **Login: yes on code; one dashboard caveat.** The flow is proven live end to
  end, and the runtime-flag mechanism that lets you turn phone OTP on/off without
  a rebuild is verified. But production login correctness also depends on Auth
  dashboard settings (B5) that only you can set and this audit cannot read.
- **Everything: no — and the honest list is short.** Users on production today
  would get none of the 156 commits (B1), an admin password attackers already
  have (B2), and legal pages with placeholder text (B3). None of those are code
  problems, and none will be fixed by more testing on dev.

The 2026-08-08 audit's warning still applies: *empty arrays make tests pass and
dashboards render blank*. This report's "yes" claims are backed by observed
values, not absence of error — and the same standard is what you should demand
of the production verification after B1: run `tests/e2e/verify-151.mjs` against
staging, and check the health page, not the deploy log.

---

## Appendix — reproducibility

```bash
# Baseline
npm run typecheck && npm test

# Live E2E against dev (canonical order; email off + broadcasts dry-run —
# the personas' @influnet-audit.test addresses hard-bounce, and dev holds
# real push tokens):
export NOTIFY_EMAILS_ENABLED=false BROADCAST_DRY_RUN=true CRON_SECRET=e2e-local-secret
npm run dev --workspace=apps/web &          # then wait for /api/health
node --env-file=apps/web/.env.local tests/e2e/seed-personas.mjs
node --env-file=apps/web/.env.local tests/e2e/phase3-requests.mjs
node --env-file=apps/web/.env.local tests/e2e/phase4-lifecycle.mjs
node --env-file=apps/web/.env.local tests/e2e/phase5-payments.mjs
node --env-file=apps/web/.env.local tests/e2e/phase6-admin-authz.mjs
node --env-file=apps/web/.env.local tests/e2e/phase9-unproven-units.mjs   # re-seeds itself
node --env-file=apps/web/.env.local tests/e2e/verify-signoff-race.mjs     # after phase4
node --env-file=apps/web/.env.local tests/e2e/verify-161.mjs              # re-seeds after
node --env-file=apps/web/.env.local tests/e2e/verify-164.mjs
node --env-file=apps/web/.env.local tests/e2e/verify-165.mjs
```

Report generated 2026-09-19 from `dev` @ `993d1064`.
