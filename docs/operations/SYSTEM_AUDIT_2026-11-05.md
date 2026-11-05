# Full system audit — 2026-11-05

Web, landing, mobile, API, database, CI/CD and dependencies, read against
branch `dev` at `8387129` (identical in content to `staging`). Fixes are on
branch `claude/jolly-gauss-hwelna`.

## In one paragraph

The application code is in good shape and has been hardened repeatedly. Auth
is checked server-side on every route, all 80 tables have row-level security,
webhooks verify signatures, and outbound fetches are locked to known hosts.
This pass found **one urgent issue (the Next.js version had unauthenticated
remote-code-execution advisories), now fixed**, three medium database/API gaps
(two fixed, one needs a decision), and a mobile token-storage weakness. **The
biggest risk is still not in the code: there is no production environment.**
"Production" in config points at the staging database, which real testers use.
Nothing about launch is safe until that exists.

---

## 1. What this pass changed

| Change | Why | Verified |
|---|---|---|
| **Next.js 16.3.5 → 16.4.2** (web + landing) and `sharp` | 16.3.5 carried 3 critical advisories, 2 of them *unauthenticated remote code execution* (Image Optimization API with SVG; `use cache` typed arrays), plus SSRF in image optimisation and 2 cache-poisoning issues. The web app serves `/_next/image`. 16.4.2 is past every fixed-in version and 3 weeks old (16.4.5 was 2 days old: too fresh to trust on a supply-chain basis). | Clean `npm ci`; typecheck 7/7; 869/869 unit tests; both apps `next build` (168 + 11 pages). Lockfile keeps `next` hoisted at the root — the Dockerfile copies only root `node_modules`, so a nested install would break the image build. |
| **zod ^4.4.3 → ^4.6.6** (resolves 4.6.7) | Every API request body is validated with zod; 4.4.3 can exhaust memory on oversized constrained collections. | Same as above. |
| **Migration 201** — `check_email_available` / `check_phone_available` revoked from `anon` + `authenticated` | They were callable directly through PostgREST with the public anon key, bypassing the API's 30/min limit — unlimited "does this email/phone have an account?" checks. `/api/auth/check-email` and `check-phone` now call them with the service-role client. | Applied to a scratch Postgres 16 with the real function bodies: anon ✗, authenticated ✗, service_role ✓, and the function still answers. |
| **Migration 201** — `admin_early_access_report` moved to `admin_has_permission('early_access','view')` | Migration 196 section-scoped every admin RPC except this one (167 re-created it afterwards). Any staff member, whatever their sections, could read the whole waitlist — names, emails, phones — directly, unmasked. | Same scratch DB: refused (`forbidden`) without the section, returns the report with it. |
| `/api/cron/nudges` uses the shared constant-time `cronAuthorized()` | It compared the cron secret with `===`, the only cron route that did. | Unit tests, lint. |
| Landing `metadataBase` | Relative Open Graph images resolved to `http://localhost:3000`, so shared `/join` links had no preview image. | Build output: `og:image` is now `https://influnet.io/events/…`. Override with `NEXT_PUBLIC_SITE_URL`. |
| **Google Analytics 4** for the landing site — inert until configured | Requested. See §6. | Built both ways: 0/11 pages load Google without an ID; all do with one. |
| **OpenAPI 3.1 spec + Swagger UI** for every route | Requested. See §7. | 125 paths / 195 operations; structural check (refs, params, ids); rendered in Chromium; a unit test keeps it current. |

**Migration 201 is not yet applied anywhere.** It applies automatically when
this branch reaches `dev` (`migrate-dev.yml`) and `staging` (inside
`deploy-staging.yml`). Ship it in the same deploy as the two route changes:
routes first is harmless (service role can call it either way); the migration
alone would break the signup availability checks on a deployment still running
the old routes.

---

## 2. New findings

Severity is about impact on real users today, not theory.

| # | Sev | Finding | Status |
|---|---|---|---|
| N1 | **Critical** | Next.js 16.3.5 — unauthenticated RCE advisories (see §1). | ✅ Fixed |
| N2 | **Medium** | **Event registration leaks PII by phone number.** `/api/event-pass` returns the *existing* pass code when an already-registered phone is submitted; `/api/event-survey` `lookup` returns first name, city and Instagram handle for any registered phone, and `submit` overwrites their answers. No proof of owning the number. Rate limit 40–60/min per IP, CORS `*`. The event (Silicon Nexus S2) was on **25 Sep 2026** and both routes are still live, on **dev**. | ⚠️ Needs your decision — recommended: remove `silicon-nexus-s2` from `EVENTS` (`api/event-pass/route.ts`) and `SURVEY_EVENTS` (`lib/event-survey.ts`) now; for the next event, require a phone OTP before returning a pass or survey data. |
| N3 | Medium | Account enumeration via direct RPC (see §1). | ✅ Fixed (201) |
| N4 | Medium | `admin_early_access_report` not section-scoped (see §1). | ✅ Fixed (201) |
| N5 | **Medium** | **Mobile stores refresh tokens in plain storage.** `apps/mobile/lib/accounts.ts` (multi-account switcher) writes each account's *full* Supabase session — refresh token included — to AsyncStorage. `lib/supabase.ts` promises the refresh token "always stays in SecureStore"; the account book silently breaks that promise. Readable on a rooted/jailbroken phone or from an unencrypted device backup, and a refresh token is a long-lived login. | Open. Fix is JS-only (SecureStore is already in the build), so it can ship as an OTA: keep the session JSON in AsyncStorage *without* `refresh_token`, store each account's refresh token in SecureStore under its own key. |
| N6 | Medium | **Hidden-field masking is API-only.** Staff with e.g. `phone` hidden see it masked in the console, but every `admin_*` RPC returns the real value; a staff member calling the RPC directly with their own JWT sees everything in the sections they hold. Section scoping is now in SQL (196/201); field masking is not. | Open — architecture. Either mask inside the RPCs (pass hidden groups from `admin_members`), or revoke `admin_*` from `authenticated` and call them only via service role after `withAdmin`. The second is simpler. |
| N7 | Low | **Landing site sends no security headers** (no HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`); `apps/landing/next.config.ts` is empty. The web app has them. | Open. Add `globalHeaders` in a `staticwebapp.config.json` (Azure Static Web Apps applies these regardless of framework), then check with `curl -I https://influnet.io`. |
| N8 | Low | `/api/auth/pending-registration` is anonymous and accepts any `user_id`. Someone who knows a signup's user id (a random UUID, never shown before confirmation) could swap in their own verified phone token before the victim confirms. | Accepted risk — window is minutes and the id is unguessable. Revisit if user ids ever appear in public URLs pre-confirmation. |
| N9 | Low | **43 advisories remain** in production dependency trees (3 critical, 18 high). None are in the web server's request path any more: `dompurify` (via `posthog-js`, browser analytics), `shell-quote` (React Native dev tools), `proxy-addr`/`express`/MCP SDK (via the **`shadcn` CLI listed under `dependencies`** instead of `devDependencies`), `axios` (via `stream-chat`, mobile), `undici`, plus Expo's CLI chain. | Open. Move `shadcn` to `devDependencies`; run `npm audit fix` (non-breaking only) in its own PR and test a mobile build before merging, since it changes the mobile bundle. Expo 58 is a separate, planned upgrade. |
| N10 | Low | **CI supply chain.** Third-party actions are pinned to tags (`@v1`, `@v4`), not commit SHAs; most workflows don't declare `permissions:`, so they get the repository default token scope; the landing workflow still uses `actions/checkout@v3`. | Open. Pin to SHAs (Dependabot can keep them current), add `permissions: contents: read` at the top of each workflow and widen per job. |
| N11 | Low | **Dangerous leftovers in the repo.** `docs/APPLY_PENDING_MIGRATIONS.sql` is a July "paste this into the SQL editor" bundle of migrations 051–05x. Running it today would reset the review RLS policies, business column grants and stage-item objects to their July definitions, undoing later fixes to the same objects (e.g. 183's review guard). Also `test_email_rpc.sql`, `fix-hrefs.js`, `apps/web/test-stream*.ts`, and `supabase/cleanup.sql` + `docs/operations/SUPABASE.md`, which both point at a **third, original** Supabase project (`hrpaqufvjcihnjrjnpej`) from the Firebase-hosting era, not dev or staging. | Open. Delete the SQL bundle and scripts; archive `SUPABASE.md`. Find out whether that original project still exists and holds real user data — if so, it needs deleting or securing too. |
| N12 | Info | `/api/conversations/[id]/messages/route.ts` has literal control characters in a regex, so `git`/`grep` treat it as binary and diffs of it are unreadable. | Open — rewrite as `\u0000-\u0008…` escapes. |
| N13 | Info | AGENTS.md said `admin_*` section scoping was "the known follow-up"; migration 196 did it. | ✅ AGENTS.md updated. |

Checked and **not** a problem (so nobody re-investigates): web source maps are
built but deleted from the image before deploy (`Dockerfile` runner stage);
`tokenAal()` decodes the JWT unverified but only after `withAuth` has verified
it; the Razorpay, Stream and Resend webhooks verify signatures over the raw
body with constant-time compares and refuse placeholder secrets; the
portfolio / avatar / oEmbed fetchers are host-locked, https-only and refuse
redirects; `/api/stream/channel` checks both users are participants; no table
lacks RLS; only `public` anon keys are committed.

---

## 3. Still open from earlier audits (re-checked today)

From [SECURITY_AUDIT_2026-09-29.md](SECURITY_AUDIT_2026-09-29.md) and
[HANDOVER.md](HANDOVER.md). Items marked *dashboard* could not be seen from
the repo.

| Item | State today |
|---|---|
| **No production tier** — no `main` branch, `deploy-prod.yml` never run (4 known defects), no production Supabase project, mobile `production` profile points at staging | Unchanged. Still the #1 risk. |
| Stage machine and checklist gates enforced only in the API, not in SQL | Unchanged. Payment gates are safe (they need a Razorpay-confirmed capture); the other gates can be skipped by calling PostgREST directly. |
| Stream chat tokens never expire (`client.createToken(userId)`, no `exp`) | Unchanged. A leaked token reads that user's chats for ever. |
| Cloudinary upload signing has no `allowed_formats` / size cap | Unchanged. |
| CSP is report-only and has no `script-src` | Unchanged. |
| Phone OTP token not single-use; phone numbers not unique across accounts | Unchanged. |
| Upstash not configured on staging → rate limits are per replica and reset on restart | *Dashboard* — `/dashboard/admin/rate-limits` will tell you. |
| Admin MFA not enforced (`ADMIN_REQUIRE_MFA`) | *Dashboard*. Do this before anything else in §8. |
| Email confirmation on signup | *Dashboard*. |
| Backups never test-restored | Unchanged. |
| Alerts (uptime, Sentry, Azure, Supabase usage) | *Dashboard*. Not confirmed configured. |
| Legal pages | **Improved:** no `[[placeholder]]` left in `legal-content.ts`; `TERMS_VERSION` is `2026-09`. Still needs the licence clause for user content (OWNER_TODO E). |
| `staging` vs `dev` | **In sync** (0 commits apart in content). Last change 2026-10-23. |

---

## 4. Architecture — what is missing

Ordered by how much it would hurt to discover it during launch.

1. **A production environment.** Separate Supabase project (Pro, `ap-south-1`,
   PITR), separate Azure Container App (min 1 replica), `main` branch, working
   `deploy-prod.yml` with a migrate job. HANDOVER P0.1–P0.4 has the exact steps.
2. **Infrastructure as code.** Azure resources exist only as portal clicks and
   additive `az containerapp update` calls. Staging works partly because env
   vars set by hand months ago survive every deploy. Write the Container App,
   its env and secrets as Bicep (or a script) in the repo, so prod can be built
   identically and rebuilt after a disaster.
3. **A forced-update path for mobile.** Nothing in the app or API refuses an
   old build (`X-Influnet-Client` is analytics-only by design). When an API
   change breaks installed apps, or a security fix must reach every phone, you
   need a minimum-supported-version check: serve `minVersion` from an endpoint
   (like `/api/auth/config`) and show a blocking "please update" screen.
4. **Distributed rate limiting and alerting** (Upstash; one alert channel).
   Without them, abuse and outages are both invisible.
5. **A real job runner.** Broadcasts, nudges, maintenance and the OTP purge run
   as GitHub Actions cron jobs calling HTTP endpoints. GitHub cron is
   best-effort (delays of 15+ minutes and skipped runs are normal), has no
   retries, and fails silently if a secret is missing (OWNER_TODO B3). Move
   them to Azure Container Apps Jobs or Supabase `pg_cron` + `net.http_post`,
   and alert on a missed run.
6. **Database-level enforcement of the stage machine** (needs the product
   decision noted in the 09-29 audit), and **field masking inside admin RPCs**
   (N6).
7. **Data retention jobs** (DPDP Act) — only OTP logs are purged today
   (OWNER_TODO D3).
8. **Disputes and refunds** inside the product rather than the Razorpay
   dashboard (OWNER_TODO D2).
9. **Native crash reporting** on mobile at the next store build (OWNER_TODO D4).
10. **Restore drill.** Your real recovery time is unknown until you've done one.

---

## 5. Everything that is reachable, stated plainly

So that nothing is implicit, here is what anyone on the internet can reach
without an account. The full list, including every signed-in, admin, cron and
webhook route with its access rule and rate limit, is the API reference (§7).

**Public HTTP routes (22 operations):** `GET /api/health`,
`GET /api/auth/config`, `GET /api/auth/check-email|check-phone|check-username|check-instagram|suggest-username|scrape-instagram|social-preview`,
`POST /api/auth/pending-registration|verify-instagram-bio`,
`POST /api/phone-otp/send|verify`, `POST /api/early-access`,
`POST /api/event-pass`, `POST /api/event-survey`,
`POST /api/creators/{username}/link-click`, `GET|POST /api/email/unsubscribe`.
Each is rate-limited per IP except `health`, `auth/config` and `unsubscribe`
(signed link). **CORS `*`:** `early-access`, `event-pass`, `event-survey`,
`auth/social-preview`.

**Directly through Supabase with the anon key** (it ships in every client, so
treat it as public): every table subject to RLS, and these functions, which
are public on purpose — `get_public_influencer`, `get_public_business`,
`get_public_reviews`, `get_creator_collaborations`, `get_creator_portfolio`,
`get_profile_layout`, `get_profile_visibility`, `get_collaboration_stats`,
`check_username_available`, `check_instagram_available`, `is_pro_public`,
`has_verified_instagram_ownership`, `record_creator_profile_view`,
`store_pending_registration`, `validate_phone_verification_token` (needs a
secret token). The phone-OTP internals are service-role only (178);
`check_email_available` / `check_phone_available` are service-role only from
201.

**Switches that change behaviour without a deploy** (know these exist):
`feature_flags` rows (phone OTP, vendor kill switches), `billing_settings`,
`EMAIL_DISABLED_TEMPLATES`, `NOTIFY_EMAILS_ENABLED`, `BROADCAST_DRY_RUN`,
`SUBSCRIPTIONS_ENABLED`, `ADMIN_REQUIRE_MFA`, `EMAIL_ALLOWLIST`. Container env
vars need a restart; flags are cached 45 s per replica.

**Third parties that receive user data:** Supabase (everything), GetStream
(chat content), Razorpay (payments), Resend (email addresses + content),
2Factor (phone numbers), Apify / HikerAPI (public social handles), Cloudinary
(uploads), Expo (push tokens), Sentry and PostHog (when keys are set; ids and
roles only, no PII by design), Meta Pixel (`/join` only), and Google Analytics
(landing, once you turn it on). The privacy policy must name each one.

---

## 6. Google Analytics on the landing page

Built, merged on this branch, and **off** until you set one GitHub variable.
Full steps: [GOOGLE_ANALYTICS_LANDING.md](GOOGLE_ANALYTICS_LANDING.md). In short:

1. Create a GA4 property + web stream for `https://influnet.io`; copy the `G-…` id.
2. **Update the privacy policy first** (`apps/landing/src/lib/legal-data.ts`,
   sections 3 and 6). Draft wording is in the guide. Today it names only the
   Meta Pixel.
3. GitHub → Settings → Secrets and variables → Actions → **Variables** →
   `LANDING_GA_MEASUREMENT_ID = G-…`.
4. Re-run the *Azure Static Web Apps CI/CD* workflow (the id is baked in at
   build time).
5. Check GA → Realtime shows you, and `sign_up_click` fires on *Get started*.

Ad features are off (consent defaults deny ad storage and personalisation,
Google signals off), and only page paths are sent, never query strings or form
contents.

## 7. API reference (Swagger / OpenAPI)

[`docs/api/`](../api/README.md):

- `index.html` — Swagger UI; open it straight from the repo.
- `openapi.json` — OpenAPI 3.1, for Postman / Insomnia / Swagger Editor.
- 125 paths, 195 operations — **every** route, including admin, cron and
  webhooks. Each says who may call it, its rate limits, whether CORS is open,
  and which file implements it. These facts are read from the code by
  `scripts/generate-openapi.mjs`, so they can't drift silently;
  `tests/unit/openapi-coverage.test.ts` fails if a route changes without
  regenerating.
- Request/response shapes are hand-documented for the 89 most-used
  operations (`openapi.overrides.json`). The rest say "read the source" rather
  than guess, because envelopes differ per route.
- Not served by the app on purpose: it maps every admin endpoint. If you want
  it in-product, put it behind `withAdmin`.

---

## 8. Next moves

**This week (≈1 day of work, mostly yours)**

1. Merge this branch to `dev`, then `dev → staging`. That ships the Next.js
   fix, migration 201 and the two route changes together.
2. Close the event endpoints (N2): one-line removals; I can do it once you
   confirm no second event is planned on the same slug.
3. Turn on admin MFA: Supabase MFA on both projects → every admin enrols →
   `ADMIN_REQUIRE_MFA=true` (OWNER_TODO B1). One leaked admin password currently
   exposes every user and can message all of them.
4. Renew `SUPABASE_ACCESS_TOKEN` (OWNER_TODO A2) and set Upstash on staging
   (B4).
5. Delete `docs/APPLY_PENDING_MIGRATIONS.sql` and the other leftovers (N11).

**Before real users (the go-live path, in order)**

6. Production tier — HANDOVER P0.1 → P0.4, written as code (§4.2).
7. Email confirmation + Resend SMTP on production (P0.5).
8. Live Razorpay keys and prove one real rupee opens a gate (P0.7).
9. Mobile `production` profile → production, new store build (P0.9), with the
   SecureStore fix (N5) and a minimum-version gate (§4.3) in the same build.
10. Alerts to one channel; one backup restore drill (P0.10, P0.12).
11. Privacy policy names every processor in §5, including GA when you enable it.

**First month after launch**

12. Stream token expiry + client refresher; Cloudinary format/size caps (needs
    an OTA first); CSP from report-only to enforcing; single-use OTP tokens.
13. Field masking for staff in SQL (N6); stage machine in SQL.
14. Move scheduled jobs off GitHub cron (§4.5); data retention (§4.7).
15. `npm audit fix` PR + `shadcn` to devDependencies (N9); pin Actions to SHAs
    (N10).

---

## 9. How this was checked, and what wasn't

- **Read:** every API route's auth path (125 files), the auth/admin wrappers,
  rate limiter, webhooks, URL fetchers, proxy, `next.config` for both apps, the
  Dockerfile, all workflows, mobile session storage, and all 197 migration files (001–201)
  (scanned for SECURITY DEFINER functions without `search_path`, functions
  executable by `anon`/`PUBLIC` without a caller check, tables without RLS, and
  admin RPCs without section checks).
- **Ran:** `npm audit` (production trees), typecheck, the 869 unit tests, both
  production builds, migration 201 on a scratch Postgres 16, the Swagger page
  in Chromium.
- **Not done:** nothing ran against the live dev or staging databases or
  sites; no penetration test against deployed URLs; the E2E harness was not run
  (it needs `.env.local` secrets that aren't in this checkout); dashboards
  (Supabase, Azure, Razorpay, Sentry, GitHub settings) were not visible, so
  every *dashboard* item above is from earlier docs, not observed. The mobile
  app was read, not built or run.
- The two SECURITY DEFINER trigger functions without a pinned `search_path`
  (`handle_new_collab_request`, `handle_update_collab_request`, migration 047)
  are trigger-only, not callable as RPCs; worth pinning when next touched.
