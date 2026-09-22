# Go-live audit — 2026-09-16/17

Question asked: *is Influnet capable of going to real users?* Context: since
2026-09-16 **staging is production** (owner decision, see
[BLOCK_0_TO_5_STATUS_2026-09-14.md](BLOCK_0_TO_5_STATUS_2026-09-14.md)), so
"ready" means staging — `staging.influnet.io` on Supabase `aokdansyqxracuwsosji`.

Companion to [HANDOVER.md](HANDOVER.md). Everything below was checked against
the running code or the live databases, not recalled.

---

## Verdict

**Not yet — but every remaining blocker is now configuration or a decision,
not code.** The code blockers found in the audit are fixed and committed on
local `dev` (unpushed). What stands between the app and real users is the
short list in [§3](#3-what-only-you-can-do-in-order), most of which is minutes
of dashboard work.

---

## 1. Found and fixed (commits on `dev`, not pushed)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Critical** | The new super-admin tier (`2d91fb65`) made `withAuth` select `profiles.is_super_admin`. `authenticated` has column-level grants and that column isn't one, so **every API call from every user returned 403 "Profile not found"**. Migration 150 was already on the dev DB, so the next dev deploy would have taken the app down. Reproduced with a real persona JWT. | `757563cf` — tier read server-side only; `GET /api/admin/tier` for the UI |
| 2 | **Critical** | A plaintext admin password was committed in `.agents/lessons_learned.md` (`2d91fb65`). | `9224eca9` removes it from the tree. **Still in `2d91fb65`'s history — see §3.1.** |
| 3 | High | Same commit's sidebar dropped Home / Public profile for creators and brands and linked three routes that don't exist (404s). | `757563cf` |
| 4 | High | Super admin granted by email pattern (`dev.admin@…`). Signup doesn't verify addresses. | `757563cf` — flag only |
| 5 | High | `guard_profile_privileges()` was `SECURITY DEFINER`, so `current_user` was always the owner and **the role/verification guard has been a no-op since migration 070**. Only column grants stopped self-promotion. Proven in a rolled-back transaction: with a grant present, a creator could set `role='admin'`. | `757563cf` — migration **151** (applied to dev) |
| 6 | Medium | `provision_admin` 3-arg overload made every 3-arg call fail (42725); re-provisioning silently demoted super admins. | migration 151, `create-admin.mjs --super/--no-super` |
| 7 | High | **Four features silently blank** on column grants: "who viewed your profile" (every viewer nameless), brand Home card (empty), brand `/dashboard/profile` (no slug), chat deal card (no brand link); plus the account switcher never recorded names. | `c4f7e744` + `tests/unit/column-grants.test.ts` |
| 8 | Medium | Emails admin page read fields the API had stopped sending — would always show "blocked". | `757563cf` |
| 9 | **Critical (dep)** | Next.js 16.2.9: 11 advisories incl. unauthenticated RCE in the image optimizer (AVIF), proxy bypass, cache confusion, SSRF. | `0007cfee` → 16.3.5 |
| 10 | Low | 12 → 6 high `npm audit` advisories (all remaining are Expo build tooling). `npm audit fix` rejected: it moved Expo 57.0.7→57.0.23 incl. native modules, which would break OTA for installed apps. | `86185b6d` |
| 11 | Medium | Project flow diagram re-rendered itself (fresh `{}` each render → `setNodes` every render). Were the only 2 lint errors. | `f2b5db8a` |
| 12 | High | `/api/email/test` only locked on `APP_ENV=production`; staging is production and **has `EMAIL_TEST_SECRET` set**, so it was live. | `8fde4649` — allow-list local/dev |
| 13 | High | Staging refused to boot if a product flag row was `false` — but `notify_emails` is the documented "stop all email" break-glass. An incident response would have become an outage on the next scale-out. | `8fde4649` — warns instead |
| 14 | Medium | Mobile store guard refused the staging backend (contradicting the decision) and nothing ran it anyway. | `60249c7b` — positive allow-list, runs as `eas-build-pre-install` |
| 15 | Medium | Staging scaled to zero: **~20s** first response after idle. | `60249c7b` — deploy pins min replicas 1 |
| 16 | Low | Sidebar lit "Overview" on every admin page; dead `pooler.ts`; health page blind to migration 150. | `fa5aa17d`, `f2b5db8a`, `60249c7b` |
| 17 | Feature | There was **no** PostHog + Sentry dashboard in the code. Built: `/dashboard/admin/observability`. | `fa5aa17d` |

Verification: typecheck 7/7 · web unit tests 532 pass · `next build` web + landing ·
`expo export` iOS + Android · Playwright walk of creator / business-admin /
super-admin · local API calls as real personas · E2E suite 294/294 (§2).

---

## 2. End-to-end suite

Run 2026-09-17 against a local server on Next 16.3.5 with every fix applied,
dev database, `NOTIFY_EMAILS_ENABLED=false` (confirmed on the boot banner),
after `seed-personas.mjs` (12/12).

| Phase | Covers | Result |
|---|---|---|
| 3 — requests | discovery, simultaneous requests to one creator, blocks | **44/44** |
| 4 — lifecycle | messaging, deals, the 12-stage machine, mutual sign-off | **49/49** |
| 5 — payments | real Razorpay test orders, signed webhooks, gate bypass attempts, completion | **43/43** |
| 6 — admin & authz | admin numbers vs DB, both admin tiers, every `/api` route vs anon / outsider / wrong role | **63/63** |
| 7 — freemium | Free vs Pro differences | **9/9** as designed |
| 8 — R1 features | short-term flows, documents, campaigns | **86/86** |

Phase 6 first reported 5 HIGH: the business-tier test admin now gets 403 on
the technical routes, which is the intended behaviour of the tier. The phase
was updated to assert both sides (403 for business tier, 200 for super admin,
flag restored in `finally`) and re-run clean.

`tests/e2e/verify-151.mjs` re-checks migration 151 on any project inside
rolled-back transactions — run it against staging after the deploy.

---

## 3. What only you can do, in order

### 3.1 Before pushing — the password (5 min)
`2d91fb65` contains the dev super-admin password in `.agents/lessons_learned.md`.
Pushing publishes it to GitHub history.
1. **Rotate it** regardless (Supabase → Authentication → Users → dev.admin@influnet.io).
2. Before the first push, fold the fix into that commit so the password never
   reaches the remote — an interactive rebase squashing `9224eca9` into
   `2d91fb65`. If it has already been pushed, rotation is the fix; rewriting
   shared history is not worth it.

### 3.2 Staging (production) Supabase Auth — 10 min · **blocks real users**
Measured on `aokdansyqxracuwsosji`, 2026-09-16:

| Setting | Now | Set to | Why |
|---|---|---|---|
| Site URL | `http://localhost:3000` | `https://staging.influnet.io` | Password-reset and confirmation links currently send real users to localhost. |
| Redirect URLs | *(empty)* | `https://staging.influnet.io/**` | The app asks for `/reset-password`; not allow-listed means Supabase falls back to Site URL. |
| Confirm email | **off** | **on** — *after* the two rows above | Anyone can register as any address. Web and mobile signup already handle the no-session case. |
| Minimum password length | 6 | 8+ | |
| Leaked-password protection | off | on | Pro plan feature. |

Dashboard: Authentication → URL Configuration, then Providers → Email. SMTP is
already Resend (`noreply@influnet.io`). Verify: request a password reset for a
test account on staging and check the link host.

### 3.3 Merge `dev → staging` (PR) — everything above ships only then
Staging is 40+ commits behind dev (last 2026-09-04): legal pages 404 there, and
none of this audit's fixes are live. The staging deploy applies migrations
148–151 on the way. `git log origin/staging..origin/dev` shows the set.

### 3.4 Staging container env — values only you hold
Confirm in the Azure portal (the deploy never sets these; hand-set values
survive deploys):
- `RESEND_WEBHOOK_SECRET` — create a Resend webhook for
  `https://staging.influnet.io/api/webhooks/resend`; without it bounces and
  complaints are never suppressed.
- `CRON_SECRET` on the container **and** `CRON_SECRET` + `NUDGE_ENDPOINT` for
  `reengagement-nudges.yml` — otherwise re-engagement nudges never run.
- `UPSTASH_REDIS_REST_URL` / `_TOKEN` — rate limits are per-replica without it.
- `ADMIN_REQUIRE_MFA=true` once admins have enrolled TOTP.
- Optional, for the new dashboard: see [OBSERVABILITY.md §3.5](OBSERVABILITY.md).

### 3.5 Still open from earlier rounds (unchanged)
Legal identity facts (entity, address, GSTIN, grievance officer) and lawyer
review · Razorpay live keys + one real rupee end to end · staging phone-OTP
template (`TWOFACTOR_TEMPLATE`) · iOS distribution certificate · a real
backup restore drill · `ACCESS_INVENTORY.md`.

### 3.6 Next native mobile build
Bump the Expo SDK patch (clears the last 6 `npm audit` highs) in the same build,
and bump `LAST_COMMIT_TIME` in settings.
