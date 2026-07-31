# Audit Remediation — 2026-07-30

Fixes for the findings in [FULL_E2E_AUDIT_2026-07-30.md](FULL_E2E_AUDIT_2026-07-30.md).

**Status:** 7 of 11 code findings fixed. 19 new unit tests, 233 total passing, typecheck + production build clean. Every fix verified against the running app, not just the test suite.

---

## Fixed

### 1. IDOR on project reviews and cards — was High/Medium, now closed

`GET /api/projects/[id]/reviews` and all three methods on `/api/projects/[id]/cards` checked that you were logged in but never that you were *on the project*, then filtered only on `project_id`. Any authenticated user could read another project's reviews (rating, comment, reviewer name) by guessing the numeric id.

New shared gate in [`lib/project-access.ts`](../../apps/web/src/lib/project-access.ts) — `requireProjectParticipant()`. Applied to reviews `GET` (the `POST` already checked) and cards `GET`/`POST`/`PATCH`.

Two deliberate choices:
- **404, not 403**, for both "not a participant" and "does not exist" — a 403 confirms the project exists, which is itself a leak on a guessable integer id.
- `PATCH`/`POST` on cards are gated too. The audit only proved the read, but the writes had the same missing check.

**Verified live** against the real audit project #80 ("Full Lifecycle Audit Project"):

| Caller | `/reviews` | `/cards` |
|---|---|---|
| Participant (business owner) | 200, real review data | 200 |
| Outsider (logged-in, unrelated) | **404**, no data | **404** |

### 2. Razorpay webhook secret could be a public placeholder in production

`RAZORPAY_WEBHOOK_SECRET` was still `your_test_webhook_secret_here`. Since the secret is the only thing making a webhook signature trustworthy, a value committed to the repo means anyone could forge a `payment.captured` event and mark a project paid.

[`verifyWebhookSignature()`](../../apps/web/src/lib/payments/razorpay.ts) now recognises the known placeholders and **refuses to verify** when `APP_ENV` is `staging` or `production`, logging what to do about it. On `local`/`dev` it warns but still verifies, so the E2E suite can keep signing its own simulated captures.

This makes the misconfiguration fail loudly instead of silently accepting forged payments. **The real secret still has to be set in the staging/production environments** — that part is infra, not code.

### 3. Username check reported server errors as "already taken"

[`use-username-availability.ts`](../../apps/web/src/lib/hooks/use-username-availability.ts) only special-cased 429. Any other non-2xx fell through to the `else` and told the user the handle was taken — a transient 500 permanently blocked signup on a name that was actually free.

Now any non-2xx returns `status: 'error'`, and a 200 whose `available` field isn't a boolean does too, rather than being guessed at.

### 4. Dead `business_profiles` query — 403 on every business page load

`shell.tsx` ran a direct `business_profiles.select("approval_status")` that migration 053's PII lockdown revoked. It 403'd on every single page load for every business account; the feature only worked because a redundant path also set the status.

Swapped to the `get_own_business_profile()` RPC that migration 053 provides for exactly this.

**Verified live** as the business account:
- Old direct select → `42501 permission denied for table business_profiles` (confirming the noise was real)
- New RPC → `approval_status: "approved"`
- Console errors on dashboard load: **none**

### 5. Blank "optional" budget was rejected with a 400

Sending a collab request with budget left blank posted `budget: null`, and `CollabRequestSchema`'s `.optional()` rejects an explicit null — a 400 on a use case the UI labels optional.

`budget` is now `.positive().nullish()` in [`packages/core/src/validators.ts`](../../packages/core/src/validators.ts). Fixed at the schema rather than in the web client so mobile gets it too. A non-positive budget is still rejected.

### 6. Negative budget silently became positive

`form.budget.replace(/[^0-9.]/g, "")` stripped the minus sign *before* the `<= 0` check, so `-500` passed as `+500`. The sanitizer now keeps `-`, and the guard uses `Number.isFinite` so garbage input is rejected instead of coerced.

### 7. GST and website had no format validation anywhere

Added `GstNumberSchema` / `WebsiteSchema` plus `isValidGstin`, `isValidWebsite`, `normalizeWebsite` to the core package, wired into all three schemas that accept these fields (`RegisterSchema`, `RegisterProfileSchema`, `BusinessProfileUpdateSchema`) **and** into the signup wizard for inline client-side feedback.

- GST: real 15-char GSTIN pattern, auto-upper-cased, `maxLength=15`.
- Website: accepts a bare host (`yourcompany.com`) and normalises to `https://`, since that is what people actually type. Rejects non-dotted hosts and non-http schemes (`javascript:` fails).
- Both stay optional — blank is valid.

**Verified live** in the wizard: invalid values show an inline error and disable Continue; `auditverify.com` is accepted; the existing E2E suite's GST (`27AABCU1234D1ZV`) still passes.

### 8. Unauthorized project showed an indefinite "Loading…"

Two separate causes: the page header rendered `project?.title || 'Loading…'`, so it said "Loading…" forever whenever the project never loaded; and a 403 surfaced as the bare word "Forbidden" with a pointless Retry button.

The header now falls back to "Project" once loading finishes, and a 403/404 renders a real state: *"This project doesn't exist, or you don't have access to it."* with an explanation and a Back to projects link.

**Verified live**: project #34 (business is not a participant) renders the access-denied state; project #80 (theirs) still loads all 12 stages with no regression.

---

## Not fixed — needs your decision

| # | Item | Why it's still open |
|---|---|---|
| 1 | `/dashboard/influencer` legacy page | 53-line wrapper still the redirect target for creators hitting bare `/dashboard`, vs the 765-line `/dashboard/home`. Deleting it changes creator landing behaviour — a product call, not a bug fix. |
| 2 | Block-user has no UI entry point | API + DB fully wired. Either ship the UI or drop the feature; both are scope beyond a fix. |
| 3 | Connections page is a static stub | Build it or hide the nav item. |
| 4 | `/dashboard/discover` returns HTTP 200 with 404 UI | Needs the `"use client"` + `notFound()` pattern reworked; invisible to users, only affects crawlers/monitoring. |
| 5 | `proxy.ts` redirects unmatched URLs to `/login` | Masks genuine 404s for anonymous visitors. Changing it touches the auth gate — wanted your call before altering redirect behaviour. |
| 6 | Audit test accounts still in the DB | `e2e.*@influnet-audit.test` plus the completed project #80. Left in place — the IDOR verification above used them. Say the word and I'll purge. |

## Still required before production (infra, not code)

1. **Set a real `RAZORPAY_WEBHOOK_SECRET`** in staging and production. The code now refuses placeholders there, so webhooks will fail closed until this is done — that's intentional, but it means payments won't confirm until the secret is set.
2. Reset-password on the `.test` TLD: not a bug. Supabase's own `/auth/v1/recover` rejects reserved TLDs, so that one E2E check uses a different throwaway domain.

---

## Verification summary

```
typecheck (apps/web)      clean
typecheck (packages/core) clean
eslint                    0 errors (39 pre-existing warnings, none in changed files)
npm test                  233 passed, 6 skipped
npm run build             clean
```

New tests: [`apps/web/tests/unit/audit-remediation.test.ts`](../../apps/web/tests/unit/audit-remediation.test.ts) — 19 assertions covering the GSTIN pattern, website normalisation, the nullish budget, placeholder-secret detection, and `requireProjectParticipant` (including that "denied" and "missing" are indistinguishable).

### E2E suite re-run

The suite had encoded several of these bugs as *expected* behaviour, so it needed updating alongside the fixes — otherwise it would report false failures. Those checks now assert the corrected behaviour and act as regression guards.

| Phase | Before | After | Change |
|---|---|---|---|
| 1 — harness smoke | 8/8 | **8/8** | Account-count check no longer order-dependent (it asserted a bare total of 9, so *any* re-run failed once phases 2/3 created their own accounts). Now counts non-audit accounts. |
| 4 — admin & guards | 16/17 | **16/17** | Unchanged (1 pre-existing skip). |
| 5 — edge cases | 9/9 | **11/11** | The GST/website and negative-budget checks asserted the bugs reproduced; they now assert rejection. Added a blank-budget check. |
| 7 — requests & guards | 17/18 | **18/18** | The IDOR finding is closed. `/reviews` and `/cards` moved into the strict-denied set, plus a leak assertion on the response body and a check that the page renders the access-denied state. |

**Suite total: 142/144 passed, 0 failed, 2 skipped** (up from 139/142 with 1 confirmed bug).

Phases 2, 3 and 6 were not re-run: they create accounts and drive a full project lifecycle, and are documented as non-idempotent — re-running them would have destroyed the end state this remediation was verified against.

Live checks were run against `localhost:3000` with the real audit accounts; each is noted under its fix above.
