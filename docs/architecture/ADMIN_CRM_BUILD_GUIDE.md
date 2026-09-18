# Admin CRM — Build Guide for the Next Developer

**Read first:** [../product/ADMIN_CRM_ANALYSIS_2026-09-17.md](../product/ADMIN_CRM_ANALYSIS_2026-09-17.md).
It covers **what** to build and **why**. This guide covers **how** to build it in this
repo without stepping on the traps that have already cost real time here.

**Status: built on 2026-09-17** as migrations **152–160**, applied on dev. The sketches
below were the plan; the real schema is in those migration files, and the operator's view
is [../operations/ADMIN_CRM.md](../operations/ADMIN_CRM.md). Where a sketch and a migration
disagree, the migration is the truth — the differences that matter:

- `broadcast_deliveries` gained `claimed_at`, so a delivery held for quiet hours cannot be
  mistaken for one abandoned by a crashed worker and sent twice.
- Reports are reached through ONE whitelisted dispatch route,
  `/api/admin/insights/<module>`, rather than a route per report.
- There is no nightly rollup table yet: the reports compute live, which is correct at
  today's size. Add the rollup when a report gets slow, not before.

Use this guide for the conventions and the traps; they are what the code follows.

---

## 1. Before you write a line

Read these, in order. Each one has caused a production-visible bug when skipped:

1. **`AGENTS.md`** (repo root) covers:
   - per-route response envelopes
   - table names (`campaign_projects`, bigint id; no `collaborations` table)
   - column-level grants failing the whole query
   - `NEXT_PUBLIC_*` frozen at build
   - fail-open vs fail-closed
   - the one-way `dev → staging` branch flow
2. **`docs/operations/SECURITY.md`**: the RLS and PII column-lockdown model.
3. **`node_modules/next/dist/docs/`**: this is Next 16. Route handlers, caching and
   middleware differ from older versions. The app uses **`proxy.ts`, not `middleware.ts`**.
   Adding a `middleware.ts` 404s the whole app.
4. **`docs/operations/ANALYTICS.md`** and **`OBSERVABILITY.md`**: what PostHog, Sentry and
   App Insights already do, and what is deliberately switched off.
5. **`docs/operations/REENGAGEMENT_NUDGES.md`**: the existing cron + push pattern your
   scheduler generalises.

Ground rules for this work:
- Work on `dev` (or a feature branch off it). Never commit to `staging`.
- Nothing is committed, pushed or deployed without the founder saying so.
- `dev` and `staging` are **separate Supabase projects**. Apply and verify a migration on
  dev first.
- Turn **`NOTIFY_EMAILS_ENABLED` off** before running the E2E harness, and turn it back on
  after. Test personas hard-bounce and damage the sending domain.
- **Do the same for push.** Point broadcast tests at a segment containing only your own
  test devices, or flip `vendor_expo_push` off. There is no "sandbox" Expo push: a real
  token gets a real notification.

---

## 2. How the admin surface is wired

```
Browser (admin)                     Next route handler                       Postgres
/dashboard/admin/<page>  ──fetch──▶ /api/admin/<thing>/route.ts
                                      withAdmin(req)       → role=admin, returns SERVICE-ROLE client
                                      withSuperAdmin(req)  → + profiles.is_super_admin
                                      callerClient(req)    → anon key + caller's JWT
                                        └─ rpc('admin_…')  ──────────────────▶ SECURITY DEFINER fn
                                                                                IF NOT is_admin() RAISE
```

**The trap that bites every new admin route.** `withAdmin` returns a **service-role**
client, and that client has no `auth.uid()`. Any RPC that guards itself with
`public.is_admin()` must be called with **`callerClient(req)`**, or `is_admin()` sees no
user and raises `forbidden`. The pattern is in `apps/web/src/app/api/admin/analytics/route.ts`:
run `withAdmin` first (authorisation, MFA option), then call the RPC through `callerClient`.

**Service-role reads** skip RLS and column grants entirely. That is the correct choice for
tables with deny-all policies such as `phone_otp_sessions`, `billing_events` and
`admin_audit_log`. It is only safe **after** `withAdmin` / `withSuperAdmin` has returned
`ok`. Never create a service client in a route that has not run one of them.

**Envelopes.** There is no shared envelope in this repo. Pick one for each new route,
document it in the route's header comment, and make the page read exactly that key. For
new admin analytics routes, prefer `{ data, range, generated_at }`, and write the shape
down.

**Nav.** Add every page to **both** `BUSINESS_ADMIN_NAV` and `DEV_ADMIN_NAV` in
`apps/web/src/components/dashboard/sidebar.tsx`, or only to `DEV_ADMIN_NAV` if it is
super-admin-only. The analysis proposes regrouping into collapsible sections. Do that
regrouping once, in Phase 0, before adding twenty items.

**Page tier guard.** Super-admin pages use
`components/dashboard/admin/developer-gate.tsx` and `useAdminTier()`. The route guard is
the real protection; the UI gate only avoids a confusing screen.

**Audit.** Every state-changing admin action calls `audit({...})` from
`lib/admin-audit.ts`. Extend the `AdminAction` union there. `audit()` never throws, so a
failed audit write won't roll back the action. Don't wrap it in try/catch that hides its
log.

---

## 3. Recipe: add an analytics module

Example: "Payments ledger". Follow the same six steps for any analytics screen.

### Step 1 — migration
The next free number is **152** at the time of writing. Check `supabase/migrations/`
first; numbers have collided before (email 098 → 100).

```sql
-- 152_admin_payments_ledger.sql
-- WHY: <one paragraph: what question this answers and why it can't be derived client-side>

CREATE OR REPLACE FUNCTION public.admin_payments_ledger(
  p_from   DATE,
  p_to     DATE,
  p_kind   TEXT DEFAULT NULL,     -- whitelisted below, never interpolated
  p_status TEXT DEFAULT NULL,
  p_limit  INT  DEFAULT 50,
  p_offset INT  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT  := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset INT  := greatest(coalesce(p_offset, 0), 0);
  -- IST day boundaries, always. Stored timestamps are UTC.
  v_from   TIMESTAMPTZ := (p_from::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to     TIMESTAMPTZ := ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'range too large';
  END IF;
  -- … query with count(*) OVER () for total, ORDER BY, LIMIT v_limit OFFSET v_offset
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_ledger(DATE, DATE, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payments_ledger(DATE, DATE, TEXT, TEXT, INT, INT) TO authenticated;
```

Rules every admin RPC follows. They are already the house style in 098/099/108:
- `is_admin()` check is the **first** statement.
- Every window and limit is **clamped**. A typo must not become a full-table scan.
- `STABLE SECURITY DEFINER SET search_path = public`.
- `REVOKE … FROM anon`, `GRANT … TO authenticated`. The function guards itself.
- Counts come from `count(*)` in SQL, **never** by fetching rows into Node. PostgREST caps
  responses at Max Rows (1000 by default), which is why the current Overview is wrong past
  that size.
- Group days with `(created_at AT TIME ZONE 'Asia/Kolkata')::date`, not `created_at::date`.
- A new table gets `ENABLE ROW LEVEL SECURITY`, explicit policies (or none, for
  service-only), and `REVOKE INSERT, UPDATE, DELETE, TRUNCATE … FROM authenticated, anon`
  where users must not write. RLS does not cover TRUNCATE; migration 115 explains why.

Apply to **dev**: `node scripts/apply-migration.mjs 152`. CI applies migrations on deploy
(`supabase db push --include-all`, CLI pinned to **2.111.0**).

### Step 2 — route
```ts
// apps/web/src/app/api/admin/payments/route.ts
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&kind=&status=&page=
//   → { data: { rows, total }, range: { from, to }, generated_at }
import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin } from '@/lib/api';

export async function GET(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    // parse + validate query with zod; whitelist kind/status
    const { data, error } = await callerClient(req).rpc('admin_payments_ledger', { /* … */ });
    if (error?.message?.includes('does not exist')) {
      return jsonError(503, 'Apply migration 152 on this database and retry.', error);
    }
    if (error) return jsonError(500, 'Could not load payments', error);
    return NextResponse.json({ data, range: { /* … */ }, generated_at: new Date().toISOString() });
  } catch (err) {
    return jsonError(500, 'Could not load payments', err);
  }
}
```
Use a **specific 503** for a missing function (migration not applied), not a generic 500.
A missing function is a real state on an environment that is behind.

### Step 3 — page
- `apps/web/src/app/dashboard/admin/payments/page.tsx`, client component, fetch through
  `apiFetch` from `@/lib/api-client`.
- Build from the Phase 0 kit: `DateRangeBar` → `KpiTile` row → chart → `DataTable`
  (server-paginated, CSV). Existing primitives: `components/ui/{chart,stat-card,table,section-card,tabs,empty-state,skeleton}.tsx`.
  Charts are Recharts via `chart.tsx`; extend that file rather than importing Recharts
  directly.
- Keep **"not recorded before <date>"** separate from **"nothing in this range"**. A blank
  chart that means "we never captured this" reads as "business is dead".
- Follow `docs/architecture/DATA_MODEL.md` and the dashboard UI system tokens. No new gray
  palette classes.

### Step 4 — CSV export
Export via the same RPC with a larger clamped limit, streamed as `text/csv` from a
`?format=csv` branch. Audit it (`report_exported`, with filters in metadata). Strip phone
and email columns unless `withSuperAdmin` passes.

### Step 5 — tests
- **Unit:** `apps/web/tests/unit/`. If your route selects columns from `profiles` or
  `business_profiles` with a caller JWT, `column-grants.test.ts` scans for ungranted columns.
  Keep its grant list in step with migrations.
- **Authz:** extend `tests/e2e/phase6-admin-authz.mjs`. A creator, a business and an
  unauthenticated caller all get 401/403; admin gets 200; super-only routes refuse plain
  admin.
- **Prove the query as a real persona JWT**, not the service key. Unit tests mock the
  database and have missed every grant bug this repo has shipped.
- Schema questions (did the index land, what does the function return) go through
  `tests/e2e/lib/sql.mjs` (Management API; batch statements, it throttles).

### Step 6 — docs
- Add the page to the table in `docs/product/ADMIN_CRM_ANALYSIS_2026-09-17.md` §2.1 with
  "built <date>".
- Record the migration in the migration-state notes the team keeps
  (`docs/operations/HANDOVER.md` / `SUPABASE.md`).

---

## 4. Schema sketches for the new capture tables

Only these are genuinely new facts. Everything else in the analysis is derived from
existing tables.

### 4.1 `user_daily_activity` — DAU, retention, heatmap, platform/version
```sql
CREATE TABLE public.user_daily_activity (
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_ist        DATE NOT NULL,
  platform       TEXT NOT NULL CHECK (platform IN ('web','ios','android','unknown')),
  app_version    TEXT,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hours_bitmap   INTEGER NOT NULL DEFAULT 0,   -- bit n = active in IST hour n
  hits           INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day_ist, platform)
);
CREATE INDEX ON public.user_daily_activity (day_ist, platform);
-- RLS on, no policies; written only by a SECURITY DEFINER touch function.
```
- **Write path.** `withAuth` in `apps/web/src/lib/api.ts` already fires
  `rpc('touch_last_active')`, throttled in process. Extend that function, or add
  `touch_activity(p_platform, p_version)`, so it does
  `INSERT … ON CONFLICT DO UPDATE SET last_seen_at = now(), hours_bitmap = hours_bitmap | (1 << extract(hour from now() AT TIME ZONE 'Asia/Kolkata')), hits = hits + 1`.
  Keep the throttle; don't write on every request.
- **Platform and version.** Add a header in the shared client (`createApiClient` in
  `packages/api`, used by `apps/mobile/lib/api.ts`), e.g. `X-Influnet-Client: ios/1.4.2`
  built from `Platform.OS` + `Constants.expoConfig.version`. Web sends `web`.
  **Parse it defensively**: it is client-controlled, so treat it as a label, never as
  authorisation.
- **Retention.** This table grows as users × days. At 10k DAU that is ~3.6M rows a year.
  Fine for Postgres. Roll old months into `admin_daily_metrics` and purge after 13 months
  if capacity requires (see `SUPABASE_CAPACITY_2026-08-02.md`).
- The history starts on deploy day. Say so in the UI.

### 4.2 `push_devices` — multi-device push
```sql
CREATE TABLE public.push_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expo_token      TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL CHECK (platform IN ('ios','android')),
  app_version     TEXT,
  os_version      TEXT,
  permission      TEXT NOT NULL DEFAULT 'granted' CHECK (permission IN ('granted','denied','undetermined')),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at     TIMESTAMPTZ,
  disabled_reason TEXT,             -- DeviceNotRegistered | signed_out | user_revoked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON public.push_devices (user_id) WHERE disabled_at IS NULL;
-- RLS on. No SELECT for authenticated: a user must never read anyone's token, including
-- via a join. All writes through /api/profile/push-token with the service client.
```
- **Token moves to a new account.** On register, `UPSERT` by `expo_token` and **reassign
  `user_id`**. A token that moved accounts (sign-out → sign-in as someone else on the same
  phone) must stop receiving the old account's pushes.
- **Sign-out:** the app already posts `token: null`. Change that to disable **this
  device's** row. Don't blank every device.
- **Transition:** keep writing `profiles.expo_push_token` until `notifyUser()` reads
  `push_devices`, then stop. Don't drop the column in the same release. Old app builds in
  the field still call the old body shape; accept both.
- The mobile side is JS-only (`apps/mobile/lib/push.ts`), so it **ships via OTA**. Follow
  the mobile release rules in §7.

### 4.3 `broadcasts`, `broadcast_runs`, `broadcast_deliveries`
```sql
CREATE TABLE public.broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('announcement','promo','tutorial','system','reminder')),
  title            TEXT NOT NULL CHECK (char_length(title) <= 65),
  body             TEXT NOT NULL CHECK (char_length(body) <= 240),
  image_url        TEXT,
  deep_link        TEXT,                       -- validated against an allow-list of app paths
  guide_id         TEXT,                       -- for kind=tutorial: a GuideScript id from packages/core
  channels         TEXT[] NOT NULL,            -- subset of {push,in_app,email}
  in_app_style     TEXT CHECK (in_app_style IN ('toast','banner','modal')),
  audience         JSONB NOT NULL,             -- segment definition, see §5
  send_at          TIMESTAMPTZ,                -- one-off
  frequency        TEXT CHECK (frequency IN ('once','daily','weekly','monthly')) DEFAULT 'once',
  by_weekday       SMALLINT[],                 -- 1=Mon … 7=Sun, weekly only
  by_monthday      SMALLINT,                   -- monthly only
  time_ist         TIME,                       -- recurring only
  starts_on DATE, ends_on DATE,
  respect_quiet_hours BOOLEAN NOT NULL DEFAULT TRUE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','scheduled','sending','sent','paused','cancelled','failed')),
  system_owned     BOOLEAN NOT NULL DEFAULT FALSE, -- nudges / renewal reminders: pausable, not deletable
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.broadcast_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id   UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  scheduled_for  TIMESTAMPTZ NOT NULL,
  started_at     TIMESTAMPTZ, finished_at TIMESTAMPTZ,
  targeted INT DEFAULT 0, sent INT DEFAULT 0, failed INT DEFAULT 0,
  delivered INT DEFAULT 0, opened INT DEFAULT 0,
  UNIQUE (broadcast_id, scheduled_for)          -- a double scheduler tick cannot create two runs
);

CREATE TABLE public.broadcast_deliveries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id          UUID NOT NULL REFERENCES public.broadcast_runs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('push','in_app','email')),
  device_id       UUID REFERENCES public.push_devices(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','deferred','skipped','sent','error','delivered','opened')),
  skip_reason     TEXT,          -- opted_out | frequency_cap | no_device | quiet_hours
  expo_ticket_id  TEXT,
  error_code      TEXT,
  sent_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, opened_at TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (run_id, user_id, channel, device_id)
);
CREATE INDEX ON public.broadcast_deliveries (run_id, status);
CREATE INDEX ON public.broadcast_deliveries (status) WHERE status IN ('queued','sent');
```
All three tables are service-role only (RLS on, no policies, grants revoked). The admin
reads them through `is_admin()` RPCs.

### 4.4 In-app announcements and preferences
```sql
CREATE TABLE public.announcement_views (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ, dismissed_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, broadcast_id)
);  -- users may INSERT/UPDATE their own row only

CREATE TABLE public.notification_preferences (
  user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('transactional','announcements','promotions','tips')),
  push BOOLEAN NOT NULL DEFAULT TRUE,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, category)
);  -- 'transactional' push cannot be turned off (stage changes, payments) — enforce in the API
```
`profiles.nudges_opt_out` already exists. Map it to `tips` and keep reading it until
migrated. Don't create two opt-outs that disagree.

### 4.5 `deleted_accounts` — tombstones
```sql
CREATE TABLE public.deleted_accounts (
  user_id          UUID PRIMARY KEY,            -- NO FK: the profile is gone
  role             TEXT NOT NULL,
  signed_up_at     TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by       UUID,                        -- = user_id for self-service
  deleted_via      TEXT NOT NULL CHECK (deleted_via IN ('self_web','self_mobile','admin')),
  reason_code      TEXT,                        -- not_useful | privacy | duplicate | found_alternative | other
  reason_text      TEXT CHECK (char_length(reason_text) <= 500),
  email_hash       TEXT,                        -- sha256(lower(email) || salt) — re-signup detection only
  phone_hash       TEXT,
  city             TEXT,
  stats            JSONB NOT NULL DEFAULT '{}'  -- projects, completed, payments_count, gmv_paise, was_pro, verified
);
```
- **Write it BEFORE `auth.admin.deleteUser()`**, in both
  `apps/web/src/app/api/profile/route.ts` (DELETE) and
  `apps/web/src/app/api/admin/users/[id]/route.ts` (DELETE). After the delete there is
  nothing left to summarise. If the tombstone write fails, **don't delete**: return 500 and
  log it. This is a deliberate fail-closed.
- **Keep the salt in an env secret,** not in the table or migration.
- **No name, email, phone or handle in clear.** This is the DPDP line. Payment and invoice
  rows keep their own retention.
- **Mobile in-app deletion:** replace the `mailto:` in `apps/mobile/app/settings.tsx` with a
  confirm sheet (type DELETE) and a reason picker → `DELETE /api/profile` with `{reason}` →
  sign out.
- **Public web page:** add a `/delete-account` page (signed-in flow, or instructions plus a
  support form when signed out) and give its URL to Google Play.

### 4.6 Smaller additions
| Table / column | Purpose | Notes |
|---|---|---|
| `pro_orders` (`razorpay_order_id` PK, `user_id`, `amount`, `status created/paid/failed/abandoned`, `is_renewal`, `created_at`, `paid_at`) | Pending and abandoned Pro checkouts, new vs renewal | Insert in `/api/billing/checkout` **after** the Razorpay order is created. The webhook updates it. A job marks `created` rows older than 1 h as `abandoned` |
| `campaign_projects.completed_at` | Exact completion analytics | Set in the completion path; backfill from `project_activity` |
| `search_events` (`user_id`, `role`, `surface`, `filters` jsonb, `result_count`, `city`, `created_at`) | Match analytics | Write from the search route, fire-and-forget. **Never** store free-text queries that could contain PII. Store structured filters only |
| `admin_daily_metrics` (`day_ist`, `metric`, `dimension`, `value`, PK on all three) | Fast dashboards | `pg_cron` at 00:10 IST; `admin_backfill_daily_metrics(from, to)` for history |
| `crm_leads`, `crm_lead_notes` | CRM Added Users | Admin-only RLS; match to `profiles` on signup by normalised email/phone (use the existing phone normaliser, migration 107) |
| `ops_events` (`kind`, `severity`, `ref`, `meta`, `created_at`) | Business failures that aren't exceptions | Webhook underpaid, breaker trips, token-purge bursts. Not a Sentry replacement |

---

## 5. Recipe: audience segments

The composer sends a JSON segment. **The server compiles it**; the client never sends SQL
or column names.

```jsonc
{
  "role": "influencer" | "business_owner" | "both",
  "creator_verification": ["verified","pending","unverified"],   // optional
  "business_approval": ["approved","pending_review"],            // optional
  "tier": ["free","pro"],
  "pro_expiring_within_days": 7,
  "active_within_days": 7,        // OR
  "dormant_for_days": 14,
  "signed_up_between": ["2026-09-01","2026-09-15"],
  "cities": ["Chennai","Coimbatore"],
  "niches": ["fitness"],
  "has_project": true,
  "platforms": ["ios","android"],
  "app_version_below": "1.5.0",
  "user_ids": ["…"]               // explicit list; max 5,000
}
```
- **One function compiles and runs it:**
  `admin_resolve_audience(p_segment jsonb, p_count_only bool)`, `SECURITY DEFINER`, with an
  `is_admin()` guard. Validate every key against a whitelist, and raise on unknown keys so a
  typo fails loudly instead of silently widening the audience.
- **The preview uses `p_count_only = true`** and returns `{total, with_push_device,
  opted_in, after_frequency_cap}`. Show all four numbers in the composer.
- **Resolve inside the send run, not at compose time.** Recurring broadcasts must re-resolve
  every run.
- **Role values:** creators are `role = 'influencer'` and businesses are
  `role = 'business_owner'`. Never include `admin`.

---

## 6. Recipe: the sender, scheduler and receipts

### 6.1 Endpoints
| Route | Auth | Does |
|---|---|---|
| `POST /api/admin/broadcasts` | admin | create/update draft |
| `POST /api/admin/broadcasts/[id]/test` | admin | send to the caller's own devices only |
| `POST /api/admin/broadcasts/[id]/schedule` | admin (+ approver above threshold) | validate, set `scheduled`, audit |
| `POST /api/admin/broadcasts/[id]/pause` / `cancel` | admin | audit |
| `POST /api/cron/broadcasts/tick` | `CRON_SECRET` header | create due runs, resolve audiences, enqueue deliveries |
| `POST /api/cron/broadcasts/send` | `CRON_SECRET` | drain `queued` in batches |
| `POST /api/cron/broadcasts/receipts` | `CRON_SECRET` | poll Expo receipts for `sent` rows ≥ 15 min old |
| `POST /api/notifications/opened` | user | mark own delivery opened (from push tap / in-app click) |

Mirror `apps/web/src/app/api/cron/nudges/route.ts` for secret checking and structure. Use a
**constant-time comparison** for the secret.

### 6.2 Scheduling
- **Preferred:** Supabase `pg_cron` + `pg_net` calling `tick` every minute and `send` every
  minute, with `receipts` every 10 min. Store the cron secret in Supabase Vault, not in the
  migration file.
- **Fallback / watchdog:** a GitHub Actions scheduled workflow (the nudge cron already lives
  in `.github/workflows`). Its minimum interval is 5 min and it can be delayed, so use it as
  a watchdog only.
- **Idempotency is what makes both safe:**
  - `UNIQUE (broadcast_id, scheduled_for)` on runs.
  - `UNIQUE (run_id, user_id, channel, device_id)` on deliveries.
  - Drain with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 100`, done in an RPC. PostgREST can't
    express it. Two overlapping workers can then never double-send.

### 6.3 Sending to Expo
- Reuse the patterns in `lib/notify.ts`: `vendorEnabled('vendor_expo_push')`,
  `withBreaker('expo_push', …)`, `fetchWithTimeout`, `channelId: 'default'`,
  `priority: 'high'`, `data.link` for deep links (the mobile side resolves it via
  `notification-link.ts`).
- **Batch up to 100 messages per request.** Expo's documented limits change, so re-check
  the Expo push docs for the current batch size, rate limit and receipt window before you
  build.
- **Put `delivery_id` in `data`** so the tap handler can report the open.
- **Ticket errors:** `DeviceNotRegistered` → disable the device row. `MessageTooBig` → fail
  the broadcast; this is a composer validation bug. `MessageRateExceeded` → back off and
  leave rows `queued`. `InvalidCredentials` → stop the run and raise an `ops_events` alert.
  This is the APNs/FCM setup, not the message.
- **Receipts:** call `getReceipts` with ticket ids (chunked). `ok` → `delivered`; errors map
  as above.
- **Quiet hours:** for non-transactional kinds, deliveries whose recipient-local time (IST
  for now) falls in 21:00–09:00 become `deferred` with a new `not_before`. Never silently
  drop them.
- **Frequency cap:** count the user's `sent` deliveries of kind `promo`/`announcement` in
  the last 24 h / 7 d before enqueueing. Skipped rows get `skip_reason`.

### 6.4 Images in push
- **Android:** image URL in the payload renders as a big picture.
- **iOS:** needs a **Notification Service Extension**. That is native code, so it needs a
  new EAS build and store submission, **not an OTA update**. Plan it into the next native
  release. Until then, the composer should warn "image shows on Android and in-app only".
- Validate the image URL is on our storage domain, HTTPS, ≤ 1 MB.

### 6.5 In-app channel
- **Write a `notifications` row per recipient** with a new `NotificationType`
  (`announcement`). Extend the union in `lib/notify.ts` and the mobile `toMobileHref`
  handling. Mobile's Realtime listener and `notification-toast.ts` then show it with no
  further work.
  - A burst of thousands of inserts is fine for Postgres.
  - Supabase Realtime fans out per row to subscribed clients. Check the realtime quota in
    `SUPABASE_CAPACITY_2026-08-02.md` before a 50k-row broadcast, and insert in chunks.
- **For `modal`/`banner` styles,** add an `AnnouncementHost` to the web dashboard layout
  and the mobile root layout. On app open it calls `GET /api/announcements/active`: newest
  unseen, not expired, audience-matched. It renders with image, CTA and dismiss, and writes
  `announcement_views`.
- **Tutorials:** `guide_id` must be one of the ids registered in
  `packages/core/src/guides/registry.ts`. The CTA opens that guide through the existing
  runtime. Validate the id server-side against the same registry (import it from
  `packages/core`).

---

## 7. Mobile release rules for this work

- **JS-only changes ship by OTA** (`eas update`). This covers device registration fields,
  the `X-Influnet-Client` header, open tracking, the announcement host, in-app deletion, and
  tutorial deep links.
- **Native changes need a store build.** This covers the iOS Notification Service Extension
  for images, any new native module, and new push entitlements. The iOS distribution
  certificate and APNs setup are **currently broken** (`APP_STORE_READINESS_2026-09-17.md`);
  fix those first.
- **Pass `EXPO_PUBLIC_*` inline and use `--clear-cache`** when publishing. Metro caches
  inlined env.
- **Bump `LAST_COMMIT_TIME`** (shown in `apps/mobile/app/settings.tsx` via
  `lib/build-info.ts`) in the shipping commit for every mobile update.
- **Do not run local simulator builds** (`expo run:ios/android`, `xcodebuild`,
  `pod install`). Verify with typecheck, tests and `expo export` for both platforms.
- **Old builds stay in the field.** Every API change must accept the previous request shape
  (e.g. push-token body with only `token`).

---

## 8. Metric definitions (write them down once)

Put these in `packages/core` as documented constants, and quote them in tooltips so the
client and the developer mean the same thing.

| Metric | Definition |
|---|---|
| Signup | `profiles` row created (role creator or business). Orphan auth users counted separately |
| Active user (day) | ≥ 1 authenticated API request that day (IST): a `user_daily_activity` row |
| DAU / WAU / MAU | distinct active users in 1 / 7 / 28 days ending that day |
| Stickiness | DAU ÷ MAU |
| Activated creator | `verification_status = 'verified'` |
| Activated business | `approval_status = 'approved'` |
| Liquidity | % of requests answered within 48 h; % of live campaigns with ≥ 1 application |
| GMV | sum of `project_payments.amount` with `status = 'paid'` (paise → ₹), by `paid_at` |
| Pro revenue | sum of captured Pro payments, by capture time |
| MRR | active Pro subscribers × current monthly price (`billing_settings.pro_price_paise`) |
| Pro churn (month) | subscribers whose period ended in the month without a renewal within grace ÷ active at month start |
| Renewal | a Pro capture for a user with an earlier Pro capture |
| Push delivered | Expo receipt `ok` (not ticket `ok`) |
| Push open rate | opened ÷ delivered |
| Retention (week n) | of users who signed up in week 0, % active at least once in week n |

---

## 9. Definition of done, per module

- [ ] Migration applied on **dev** and verified with `tests/e2e/lib/sql.mjs`. Function
      signature and grants are correct; `anon` cannot execute.
- [ ] Route runs `withAdmin` / `withSuperAdmin` first. RPCs are called via
      `callerClient`. The envelope is documented in the route header.
- [ ] Authz covered in `phase6-admin-authz.mjs`: creator, business, anonymous and admin, plus
      super admin where relevant.
- [ ] Tested with a **real persona JWT**, not the service key.
- [ ] Counts done in SQL. Lists server-paginated. No path fetches unbounded rows.
- [ ] IST day boundaries. Date range clamped.
- [ ] CSV export audited; PII columns super-only.
- [ ] Every state-changing action writes `admin_audit_log`.
- [ ] Empty states distinguish "not recorded yet" from "none in range".
- [ ] Works at phone width (the client will open it on a phone).
- [ ] Nav entry in the right tier(s).
- [ ] Analysis doc §2.1 updated with "built <date>".
- [ ] For comms: test send verified on a real Android device (and iOS once APNs is fixed).
      The kill switch stops a run mid-way. A double scheduler tick sends nothing twice.

---

## 10. Things not to do

- **Don't add an "admin can see everyone's messages" screen.** Chat lives in GetStream, and
  that is a privacy decision for the founder, not a dashboard feature.
- **Don't turn on PostHog autocapture or session replay** to get heatmaps without an
  explicit founder decision and input masking. The reasons are in `ANALYTICS.md`.
- **Don't store OTP codes,** ever. Don't show full phone numbers to non-super admins.
- **Don't add a payment-gate bypass "for testing"** from the admin. Payment gates open only
  via the signed webhook (AGENTS.md).
- **Don't read-modify-write `stage_progress`** from an admin "fix project" action. Use
  `record_stage_signoff()` / `revoke_stage_signoff()`.
- **Don't use `NEXT_PUBLIC_*` for anything the admin should toggle at runtime.** Use
  `feature_flags`. Its CHECK constraint (migration 137) lists allowed keys, so extend it in a
  migration.
- **Don't let a broadcast failure affect transactional notifications.** Keep broadcast
  sending on its own queue and breaker key (e.g. `expo_push_broadcast`), so a 50k promo can't
  trip the breaker that stage-change pushes depend on.
- **Don't build free-form SQL into the Report Builder.** Use whitelisted datasets only.
- **Don't purge the `qacreator` fixture** on staging when cleaning test data for analytics.
  Deploy smoke tests depend on it.
