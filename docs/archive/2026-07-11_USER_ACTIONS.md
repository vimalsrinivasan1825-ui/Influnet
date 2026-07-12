# Actions Needed From You — 2026-07-11

These are the items from the core-loop hardening session that only you can do (accounts, credentials, dashboards). Everything else from that session is already fixed, verified (43/43 E2E checks green), and committed.

Work top-down — item 1 is blocking real functionality today; the rest unblock pending features.

---

## 1. 🔴 Fix `SUPABASE_SERVICE_ROLE_KEY` in `apps/web/.env.local` (most important)

**Problem:** The variable currently contains a copy of your `sbp_…` CLI access token, not an actual service-role key. Because of this, **right now**:
- Every admin dashboard route (`/api/admin/*`) fails with "Invalid API key"
- The Stream webhook (`/api/stream/webhook`) cannot mirror chat messages into Postgres, so conversation previews in the messages sidebar stay empty

**Steps:**
1. Open the Supabase Dashboard → your project → **Project Settings → API keys**
2. Copy the **`service_role`** key (secret; starts with `sb_secret_` or `eyJ…`) — *not* the publishable/anon key, *not* an account access token
3. In `apps/web/.env.local`, replace the value of `SUPABASE_SERVICE_ROLE_KEY` with it
4. Restart the dev server
5. If the app is deployed anywhere (Vercel etc.), check that environment's `SUPABASE_SERVICE_ROLE_KEY` too

**Verify:** log in as an admin and open the admin dashboard — user/business lists should load instead of erroring.

⚠️ This key bypasses RLS. Never commit it, never prefix it with `NEXT_PUBLIC_`.

---

## 2. 🟠 Upstash Redis — unblocks rate limiting (High 4)

**Why:** No API route has rate limiting yet (auth, collab creation, profile-view tracking are all unthrottled).

**Steps:**
1. Create a free account at https://console.upstash.com
2. Create a **Redis** database (region closest to your users; free tier is fine)
3. From the database page copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Add both to `apps/web/.env.local` (same names)
5. Tell Claude the credentials are in place — the limiter wiring is a code task that's ready to go once they exist

---

## 3. 🟠 Sentry — unblocks error observability (Medium 8)

**Why:** API errors currently only go to the server console; once real users hit errors you can't reproduce, you'll have no trail.

**Steps:**
1. Create an account / log in at https://sentry.io
2. Create a new project, platform **Next.js**
3. Copy the **DSN** (looks like `https://<hash>@o12345.ingest.sentry.io/67890`)
4. Add to `apps/web/.env.local` as `SENTRY_DSN` (and note it for the deploy environment)
5. Tell Claude the DSN is in place — client + API wiring is a code task from there

---

## 4. 🟡 Update or delete `ADMIN_CREDENTIALS.local.txt`

**Problem:** The admin login stored in the repo root (`admin@influnet.com` + password) no longer works — sign-in returns `invalid_credentials`. A stale credentials file misleads anyone (or any future session) that uses it.

**Steps — either:**
- If you rotated the password: put the current working credentials in the file (it is gitignored via `*.local.txt`, so it stays local), **or**
- If the admin account was recreated/removed: delete the file, or recreate the admin user in Supabase Dashboard → Authentication → Users and write down the new credentials

**Verify:** `node apps/web/scripts/e2e-exercise.mjs` doesn't need it, but you can test the login on `/login` directly.

---

## 5. 🟡 Stream webhook URL (needed before production chat)

**Why:** Chat messages live in Stream; the webhook mirrors them into Postgres so the messages sidebar can show last-message previews and history survives Stream retention. Without the webhook configured, mirroring never happens in that environment.

**Steps:**
1. GetStream Dashboard → your app → **Chat → Overview → Webhooks**
2. Set the webhook URL to `https://<your-domain>/api/stream/webhook`
   (for local testing you'd need an ngrok URL; fine to defer until deploy)
3. Requires item 1 to be done first — the webhook writes with the service-role key

---

## Also pending (decisions, not blockers)

From `docs/V1_READINESS_REPORT.md` §8 — recommended answers are already noted there:
- **Payments in V1:** manual two-party stage confirmation (recommended) vs. Razorpay integration
- **Session architecture end-state:** keep Bearer-token APIs for V1 (recommended), consolidate to cookie/`@supabase/ssr` in V1.1

## How to re-verify everything after your changes

```bash
# terminal 1
cd apps/web && npm run dev

# terminal 2
cd apps/web && npm run test:e2e   # expect 43/43 passed
```
