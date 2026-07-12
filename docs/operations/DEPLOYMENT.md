# Influnet — Cloud Deployment Runbook

Canonical **manual** deploy guide (provisioning, DNS, first-time setup). For the automated pipeline, branch→environment mapping, and CI/CD secrets, see [CICD.md](CICD.md). Do the steps in order; then run [QA_AND_GO_LIVE.md](QA_AND_GO_LIVE.md). Security rationale lives in [SECURITY.md](SECURITY.md).

**Stack:** single Next.js 16 app (`apps/web`) in a Turborepo, backed by Supabase (Postgres + Auth + Storage + Edge Functions) and Stream Chat.

**Host (current plan — [D-003](../product/DECISIONS.md)):** one unified app on **Railway** (Docker build from `apps/web/Dockerfile`, `output: "standalone"`). See **[§Railway deployment](#railway-deployment-single-host--current-plan)** below. *(The earlier multi-host plan — Vercel for `dev`, Azure App Service for `staging`/`production` — is retained in [CICD.md](CICD.md) for reference but is superseded by D-003 for the initial launch.)*

---

## Railway deployment (single-host — current plan)

Deploys the whole Next.js app (UI + `/api/*`) as **one** Railway service from the Docker image. Config lives in [`railway.json`](../../railway.json) at the repo root. **Do §1 (prod Supabase + migrations) first** — the app is only as healthy as the DB it points at.

### Build-context gotchas (verified via local Docker build — do not "simplify" away)
- **`.dockerignore` must be at the repo root**, not `apps/web/`. The build context is the repo root, so a `.dockerignore` inside `apps/web/` is silently ignored. Without the root one, `.env*` files leak into the image and the **dev** Supabase project gets baked into a prod build.
- **`NEXT_PUBLIC_*` vars are inlined at BUILD time**, not runtime. They must be passed as Railway **build variables** (Docker `--build-arg`), or the browser bundle ships blank Supabase/Stream config and login silently fails. Setting them only as runtime service variables is **not enough**. The Dockerfile declares `ARG`s for: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STREAM_API_KEY`, `NEXT_PUBLIC_APP_URL`.
- Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `STREAM_API_SECRET`, …) are read at **runtime** — set those as normal service variables.

### Steps
1. **Railway → New Project → Deploy from GitHub repo**; pick this repo/branch. Railway auto-detects `railway.json` → builds `apps/web/Dockerfile`, health-checks `/api/health`, restarts on failure.
2. **Region:** pick the one closest to your prod Supabase project (India launch → Singapore) to minimise DB latency.
3. **Build variables** (Settings → Variables → *Build*, so they reach `--build-arg`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_STREAM_API_KEY`, `NEXT_PUBLIC_APP_URL` (= the Railway public URL / custom domain).
4. **Runtime variables** (same four *plus* the server-only ones from §2): `SUPABASE_SERVICE_ROLE_KEY` (real service-role **JWT**, not an `sbp_…` token), `STREAM_API_KEY`, `STREAM_API_SECRET`, `NOTIFY_EMAILS_ENABLED`, `APP_ENV=production`.
5. **Deploy.** Then set the domain and update Supabase **Auth → Site URL / Redirect URLs** + the Stream webhook to that domain (§3).
6. **Verify:** `GET /api/health` → `{"status":"healthy","database":"connected"}`, then run the §4 smoke test.

### Auto-deploy on push to `dev`
`.github/workflows/deploy-dev.yml` deploys to Railway **after** the CI/CD Pipeline succeeds on `dev` (via `workflow_run`), so a push runs the full pipeline (typecheck/lint/tests/build) and only deploys if green. Requires repo secrets `RAILWAY_TOKEN` (Railway project token) and `RAILWAY_SERVICE` (service name). **Turn OFF Railway's native "auto-deploy on push"** in the service settings — otherwise Railway builds on every push *without* waiting for CI, defeating the gate.

---

## 1. Provision a *production* Supabase project (don't reuse dev)

The dev project is `jaajosocopoicmqcffuu` — keep it as dev/staging. Create a **new** project for prod.

```bash
supabase link --project-ref <PROD_REF>
supabase db push                       # applies supabase/migrations/001..0NN in order
supabase functions deploy phone-otp
supabase functions deploy auth-signup
```
- Both edge functions are `verify_jwt = false` in `supabase/config.toml` — normal (phone-otp is public); confirm the OTP rate-limit migrations (022/026) applied.
- `supabase db push` **must apply cleanly through the latest migration.** If it errors, stop and capture output (a bad migration = no prod DB).
- Storage: confirm the `project-assets`, avatar, and profile-photo buckets exist (created by migrations 013/020/025) with correct public/policy settings.

## 2. Environment variables (host secret store — never in git)

From `apps/web/.env.example`:

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | prod project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | prod anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | prod `service_role` key (bypasses RLS). NEVER `NEXT_PUBLIC`. Must be a real service-role key — *not* an `sbp_…` account token. |
| `NEXT_PUBLIC_STREAM_API_KEY` | public | Stream key |
| `STREAM_API_KEY` | server | same value, server SDK |
| `STREAM_API_SECRET` | **server only** | signs Stream tokens + verifies webhook |
| `TWOFACTOR_API_KEY` | server (Supabase secret) | SMS OTP; set via `supabase secrets set` |
| `RESEND_API_KEY` / `EMAIL_FROM` / `NOTIFY_EMAILS_ENABLED` | server | transactional email (optional; `true` to actually send) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | server | rate limiting (see §5) — pending |
| `SENTRY_DSN` | server/public | error monitoring (see §5) — pending |

- `lib/supabase/server.ts` reads `SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL` — set at least `NEXT_PUBLIC_SUPABASE_URL`.
- **Do not** ship `SUPABASE_ACCESS_TOKEN` (the `sbp_…` management token). It's not needed at runtime and is dangerous — currently sitting in `apps/web/.env.local`; keep it out of the deployment (and out of `.env.local` ideally — put management tokens in your shell profile only).

## 3. Auth, host & integrations
1. Supabase **Auth → URL config:** set **Site URL** + **Redirect URLs** to the prod domain (email confirmation + password-reset links depend on this).
2. Supabase **Auth → SMTP:** configure a sender. Without it, signup confirmation and password reset silently no-op.
3. **Host:** for `dev`, Vercel (project root `apps/web`, build `npm run build`). For `staging`/`production`, Azure App Service running the Docker image (see [CICD.md §4](CICD.md#4-the-docker--azure-path-staging--prod)). Set all §2 vars in the host's secret store; point the domain; update Auth Site URL to match.
4. **Stream Chat:** dashboard → Chat → Webhooks → set to `https://<domain>/api/stream/webhook` (route verifies `x-signature` with `STREAM_API_SECRET`). Requires the real service-role key (§2) so it can mirror messages into Postgres.
5. **2Factor OTP:** `supabase secrets set TWOFACTOR_API_KEY=... --project-ref <PROD_REF>` (see [PHONE_OTP.md](PHONE_OTP.md)).

## 4. Post-deploy smoke test (must pass before announcing)
- Logged-out `GET /dashboard` → redirects to `/login`.
- `GET /c/<creator-username>` and `/b/<business-username>` → 200 (public profiles stay public).
- Sign up a throwaway business + creator; run the full lifecycle in [QA_AND_GO_LIVE.md](QA_AND_GO_LIVE.md) once on prod.
- Watch Supabase + Vercel logs for 500s.

## 5. Operational gaps to close before real traffic

These are **operational, not code defects** — several need an account/credential from you, then a small code wiring task.

| Item | Why | You provide | Then |
|---|---|---|---|
| **Sentry** | API errors only hit server logs today; no trail for real-user errors. | Sentry project (Next.js platform) → `SENTRY_DSN`. | Wire client + server + edge + `app/error.tsx`. |
| **Upstash Redis** | No app-level rate limiting (only OTP has a DB limit). | Upstash Redis DB → `UPSTASH_REDIS_REST_URL` + `_TOKEN`. | Limit register / reviews / collabs / discover / stream-token. |
| **DB backups / PITR** | Data safety. | Enable PITR/scheduled backups on prod Supabase; verify one restore. | — |
| **Admin audit log** | Approve/reject actions aren't recorded. | — | Add `admin_actions` table + writes in `/api/admin/*`. |
| **Make CI a merge gate** | The branch shipped with a red build once. | — | Require `.github/workflows/ci.yml` green to merge `main`. |

---

## Branches & release flow
- 3-tier: `main` — production (Azure). `staging` — prod replica / client UAT (Azure). `dev` — integration/default for development (Vercel). Feature branches (e.g. `ui/redesign`) → `dev` → `staging` → `main`. Full mapping in [CICD.md §2](CICD.md#2-branch--environment-map).
- Never commit `.env*`. One fix = one commit; migrations are append-only.
