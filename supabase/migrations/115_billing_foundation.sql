-- 115: Billing foundation — subscriptions, plan limits, and the enforcement
--      primitives the Free/Pro split is built on.
--
-- ── What this is ──────────────────────────────────────────────────────────
-- Four tables and four functions. Nothing here changes behaviour on its own:
-- with no subscription rows and enforcement off, every function reports the
-- same answers the product already assumed ("everyone can do everything").
-- The application decides whether to consult any of it — see
-- apps/web/src/lib/entitlements.ts and the SUBSCRIPTIONS_ENABLED flag.
--
-- ── Three rules this migration exists to enforce ──────────────────────────
--
-- 1. A TIER IS DERIVED, NEVER STORED AS A BOOLEAN.
--    We store the provider's status and period end; current_tier() computes
--    the answer. A stored `is_pro` column is a value that can go stale, be
--    written by the wrong code path, or disagree with Razorpay — and staleness
--    in the generous direction is a silent revenue leak.
--
-- 2. NOBODY WRITES THEIR OWN SUBSCRIPTION.
--    `authenticated` may SELECT its own row and nothing else. Every write
--    comes from the Razorpay webhook via the service role. This is the same
--    lockdown migration 083 applied to `is_verified` after creators were found
--    to be able to award themselves the verified badge. Identical failure
--    shape, identical fix — a client-writable entitlement is not an
--    entitlement.
--
-- 3. QUOTA CHECKS ARE ATOMIC.
--    Counting rows, comparing to a limit, then inserting is a check-then-act
--    race: two proposals accepted in the same instant both see one project,
--    both pass, both insert. This repo already paid for that lesson once with
--    stage_progress (see migration 114). Here the count happens inside a
--    BEFORE INSERT trigger, behind a transaction-scoped advisory lock keyed on
--    the owner, so concurrent inserts serialise and the second one sees the
--    first.
--
-- ── Why the limits live in the database ───────────────────────────────────
-- `billing_settings` holds the numbers, not packages/core. The trigger needs
-- them and so does the API; putting them in TypeScript would mean two
-- definitions free to drift, and the one that drifts silently is always the
-- one guarding revenue. packages/core carries the vocabulary (tier names,
-- feature keys) and no numbers.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tier') THEN
    CREATE TYPE public.plan_tier AS ENUM ('free', 'pro');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. billing_settings — one row, the numbers everything reads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  -- Defence in depth, OFF by default. The application layer
  -- (SUBSCRIPTIONS_ENABLED) is the switch you are meant to use; this one makes
  -- the database refuse an over-quota insert even if a route forgets to check.
  -- Left off initially so turning the product flag on cannot start rejecting
  -- writes with an error shape the UI has never rendered.
  db_enforcement_enabled  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Free-tier ceilings. NULL anywhere means "no limit".
  free_active_projects    INTEGER NOT NULL DEFAULT 2,
  free_requests_per_month INTEGER NOT NULL DEFAULT 10,
  free_shortlist_size     INTEGER NOT NULL DEFAULT 20,
  free_analytics_days     INTEGER NOT NULL DEFAULT 30,

  -- Pro price in paise, so it matches Razorpay's unit exactly and no floating
  -- point ever touches money. 99900 = ₹999.
  pro_price_paise         INTEGER NOT NULL DEFAULT 99900,
  pro_currency            TEXT    NOT NULL DEFAULT 'INR',

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.billing_settings (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in (the pricing page needs the price; the upgrade
-- prompt needs the limits). Writable by nobody but the service role, which
-- bypasses RLS entirely.
DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings
  FOR SELECT TO authenticated USING (TRUE);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.billing_settings FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. subscriptions — one row per paying user, written only by the webhook
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier                     public.plan_tier NOT NULL DEFAULT 'free',

  -- Razorpay's own vocabulary, stored verbatim rather than mapped, so a status
  -- we have not seen before is preserved instead of being flattened to
  -- something wrong. current_tier() decides which of these grant access.
  --   created → authenticated → active → (pending → halted) → cancelled/completed
  status                   TEXT NOT NULL DEFAULT 'inactive',

  razorpay_subscription_id TEXT UNIQUE,
  razorpay_customer_id     TEXT,
  razorpay_plan_id         TEXT,

  current_period_end       TIMESTAMPTZ,

  -- Mandate debits fail often in India (expired cards, insufficient balance,
  -- a paused UPI mandate). Locking a brand out of their own campaign the hour
  -- a retry fails is worse for us than a few days of unpaid access, so a
  -- failed charge moves the row to `pending`/`halted` and sets this.
  grace_until              TIMESTAMPTZ,

  cancel_at_period_end     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Webhooks arrive at-least-once AND out of order. Any event whose provider
  -- timestamp is older than this is dropped, so a late `cancelled` cannot
  -- resurrect after a newer `charged`, and vice versa.
  last_event_at            TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON public.subscriptions (status, current_period_end);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Read your own row. That is the entire client-facing surface.
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy exists, and the grants are revoked as well.
-- Both matter: a missing policy blocks the write, and the revoked grant means
-- a future "allow users to manage their own row" policy added by mistake still
-- cannot write. Belt and braces, deliberately.
--
-- TRUNCATE is revoked separately and on purpose: **RLS does not apply to
-- TRUNCATE**, so the row-level policy above would not stop it. Supabase's
-- default `GRANT ALL ... TO authenticated` hands it out on every table in
-- `public` (48 of them here). It is not reachable through PostgREST, which has
-- no verb for it, so this is depth rather than an open door — but a table whose
-- whole purpose is to say who has paid should not be truncatable by the role
-- every signed-in user holds.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscriptions FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. billing_events — the idempotency ledger
-- ---------------------------------------------------------------------------
-- Razorpay guarantees at-least-once delivery. The event id is the primary key
-- so a replayed capture is a duplicate-key error rather than a second free
-- year. Insert FIRST, then apply — if the insert conflicts, the event has
-- already been handled and there is nothing to do.
CREATE TABLE IF NOT EXISTS public.billing_events (
  razorpay_event_id TEXT PRIMARY KEY,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,
  payload           JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_user_idx
  ON public.billing_events (user_id, received_at DESC);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- No policies at all: this table is service-role only. Nothing signed in has
-- any reason to read raw provider payloads.
REVOKE ALL ON public.billing_events FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. plan_usage — counters for meters that are not derivable from other tables
-- ---------------------------------------------------------------------------
-- Active projects are NOT here: they are counted from campaign_projects, which
-- cannot drift because it is the same rows the product already reads. A
-- counter is only used where there is nothing to count — collab requests sent
-- this month, where the underlying rows may legitimately be deleted.
CREATE TABLE IF NOT EXISTS public.plan_usage (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meter        TEXT NOT NULL,
  period_start DATE NOT NULL,
  used         INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, meter, period_start)
);

ALTER TABLE public.plan_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_usage_select_own ON public.plan_usage;
CREATE POLICY plan_usage_select_own ON public.plan_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Writes go through consume_quota() only, which is SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.plan_usage FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. current_tier() — the one question every gate asks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tier(p_user UUID DEFAULT auth.uid())
RETURNS public.plan_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- A missing row and an expired one both resolve to 'free'. That is the safe
  -- direction: a paying customer briefly losing Pro is a support ticket, a
  -- free account gaining it is an invisible, unbounded leak.
  --
  -- `authenticated` and `active` both grant access. Razorpay marks a
  -- subscription `authenticated` once the mandate is registered but before the
  -- first debit settles; refusing access in that window would mean a user who
  -- has just paid sees no change.
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN s.status IN ('active', 'authenticated')
             AND GREATEST(
                   COALESCE(s.current_period_end, '-infinity'::TIMESTAMPTZ),
                   COALESCE(s.grace_until,        '-infinity'::TIMESTAMPTZ)
                 ) > now()
        THEN s.tier
      END
      FROM public.subscriptions s
      WHERE s.user_id = p_user
    ),
    'free'::public.plan_tier
  );
$$;

-- NOT granted to `authenticated`, deliberately.
--
-- It takes a user id, so granting it would let any signed-in account ask
-- "is this person paying?" about every other account — turning the customer
-- list into something anyone could enumerate one uuid at a time. Nothing in
-- the product needs that.
--
-- The functions below (get_entitlements, is_pro_public) and the quota trigger
-- all call it internally. They are SECURITY DEFINER, so they run as the owner
-- and reach it regardless of who invoked them; the caller still cannot.
REVOKE EXECUTE ON FUNCTION public.current_tier(UUID) FROM PUBLIC, authenticated, anon;

-- is_pro_public() — the ONE thing about someone else's plan that is public.
--
-- A Pro badge is meant to be seen; that is the entire point of paying for one.
-- So this exposes a single boolean and nothing else: not the status, not the
-- renewal date, not the price paid. Compare with get_entitlements(), which
-- exposes all of that and only ever about the caller.
CREATE OR REPLACE FUNCTION public.is_pro_public(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_tier(p_user) = 'pro'::public.plan_tier;
$$;

GRANT EXECUTE ON FUNCTION public.is_pro_public(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_entitlements() — everything the client needs, in one round trip
-- ---------------------------------------------------------------------------
-- Deliberately reports the caller's OWN state only. There is no parameter: a
-- signed-in user can never ask this about somebody else, so it cannot become a
-- way to enumerate who is paying.
CREATE OR REPLACE FUNCTION public.get_entitlements()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     UUID := auth.uid();
  v_settings public.billing_settings%ROWTYPE;
  v_sub      public.subscriptions%ROWTYPE;
  v_tier     public.plan_tier;
  v_projects INTEGER;
  v_requests INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_settings FROM public.billing_settings WHERE id;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user;
  v_tier := public.current_tier(v_user);

  SELECT count(*) INTO v_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user
    AND status = 'active'
    AND manually_deleted_at IS NULL;

  SELECT COALESCE(used, 0) INTO v_requests
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'requests_month'
    AND period_start = date_trunc('month', now())::DATE;

  RETURN jsonb_build_object(
    'tier',   v_tier,
    'status', COALESCE(v_sub.status, 'inactive'),
    'currentPeriodEnd',   v_sub.current_period_end,
    'graceUntil',         v_sub.grace_until,
    'cancelAtPeriodEnd',  COALESCE(v_sub.cancel_at_period_end, FALSE),
    'limits', jsonb_build_object(
      'activeProjects',   v_settings.free_active_projects,
      'requestsPerMonth', v_settings.free_requests_per_month,
      'shortlistSize',    v_settings.free_shortlist_size,
      'analyticsDays',    v_settings.free_analytics_days
    ),
    'usage', jsonb_build_object(
      'activeProjects',   COALESCE(v_projects, 0),
      'requestsThisMonth', COALESCE(v_requests, 0)
    ),
    'price', jsonb_build_object(
      'paise',    v_settings.pro_price_paise,
      'currency', v_settings.pro_currency
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_entitlements() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. consume_quota() — atomic increment, or refusal
-- ---------------------------------------------------------------------------
-- Returns TRUE when the caller was within budget and the counter has been
-- incremented; FALSE when they were not, in which case NOTHING was written.
--
-- The check and the write are one statement. There is no window between them,
-- which is the entire point: `SELECT used` then `UPDATE used = used + 1` lets
-- two concurrent callers both pass at the boundary.
CREATE OR REPLACE FUNCTION public.consume_quota(
  p_meter TEXT,
  p_limit INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_period DATE := date_trunc('month', now())::DATE;
  v_used   INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_limit IS NULL THEN RETURN TRUE; END IF;  -- NULL limit = unlimited

  -- ON CONFLICT ... WHERE makes the whole thing one statement. The row is
  -- created at 1 if absent; incremented only while it is under the ceiling;
  -- and when it is at the ceiling the conflict target matches no row to
  -- update, so RETURNING yields nothing and v_used stays NULL.
  INSERT INTO public.plan_usage (user_id, meter, period_start, used)
  VALUES (v_user, p_meter, v_period, 1)
  ON CONFLICT (user_id, meter, period_start) DO UPDATE
    SET used = public.plan_usage.used + 1
    WHERE public.plan_usage.used < p_limit
  RETURNING used INTO v_used;

  RETURN v_used IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_quota(TEXT, INTEGER) TO authenticated;

-- release_quota() — give a unit back when the action did not happen.
--
-- consume_quota() has to run BEFORE the write it guards, otherwise the check
-- and the write are not atomic and the boundary leaks. The cost of that
-- ordering is that a write which then fails for an unrelated reason — a
-- duplicate-request conflict, a foreign key that vanished — has already spent a
-- unit. Without this, a user who taps "send" twice on the same creator burns
-- two of their ten monthly requests and receives one request for it.
--
-- GREATEST(...,0) rather than a CHECK failure: a double release is a bug in the
-- caller, and the right response to it is a correct counter, not a 500 in an
-- error path that is already handling an error.
CREATE OR REPLACE FUNCTION public.release_quota(p_meter TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  UPDATE public.plan_usage
     SET used = GREATEST(used - 1, 0)
   WHERE user_id = v_user
     AND meter = p_meter
     AND period_start = date_trunc('month', now())::DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_quota(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. The project cap, enforced where the row is actually written
-- ---------------------------------------------------------------------------
-- Projects are created in exactly one place — respond_to_proposal() (migration
-- 071), when the second party accepts. The brand ALWAYS owns the resulting row
-- whoever proposed it, which is why the cap lands on owner_user_id and a
-- creator is never limited by it.
--
-- A BEFORE INSERT trigger rather than a check inside respond_to_proposal():
-- the trigger runs in the same transaction as the INSERT no matter which code
-- path performed it, so a future route, a manual fix-up, or a second RPC
-- cannot route around it.
--
-- The advisory lock is what makes it correct under READ COMMITTED. Without it,
-- two acceptances for the same brand landing together each count before the
-- other commits and both are allowed. The lock serialises them; because each
-- statement takes a fresh snapshot, the second transaction's count runs after
-- the first has committed and therefore sees its row.
CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_limit   INTEGER;
  v_count   INTEGER;
BEGIN
  SELECT db_enforcement_enabled, free_active_projects
    INTO v_enabled, v_limit
  FROM public.billing_settings WHERE id;

  -- Off by default. The application layer is the switch you are meant to use.
  IF NOT COALESCE(v_enabled, FALSE) THEN RETURN NEW; END IF;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  -- Pro owners are never counted.
  IF public.current_tier(NEW.owner_user_id) <> 'free' THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('project_quota:' || NEW.owner_user_id::TEXT));

  SELECT count(*) INTO v_count
  FROM public.campaign_projects
  WHERE owner_user_id = NEW.owner_user_id
    AND status = 'active'
    AND manually_deleted_at IS NULL;

  IF v_count >= v_limit THEN
    -- Mapped by the API to a 402 with an upgrade link. The message is kept
    -- machine-readable because the route matches on it.
    RAISE EXCEPTION 'project_quota_exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_project_quota_trg ON public.campaign_projects;
CREATE TRIGGER enforce_project_quota_trg
  BEFORE INSERT ON public.campaign_projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_project_quota();

-- ---------------------------------------------------------------------------
-- 10. apply_billing_event() — the ONLY way a subscription row changes
-- ---------------------------------------------------------------------------
-- Called by the webhook route with the service-role client, after the
-- signature has been verified. Not granted to `authenticated`: a signed-in
-- user must have no path to this at all.
--
-- Two guards live here rather than in TypeScript, so they hold even if a
-- second caller is ever added:
--   • the event id is inserted first, so a replay is a no-op;
--   • an event older than the row's last_event_at is dropped, so out-of-order
--     delivery cannot resurrect a cancelled subscription.
CREATE OR REPLACE FUNCTION public.apply_billing_event(
  p_event_id    TEXT,
  p_user_id     UUID,
  p_kind        TEXT,
  p_payload     JSONB,
  p_status      TEXT,
  p_tier        public.plan_tier,
  p_period_end  TIMESTAMPTZ,
  p_grace_until TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN,
  p_subscription_id TEXT,
  p_customer_id     TEXT,
  p_event_at    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing TIMESTAMPTZ;
BEGIN
  -- Idempotency first. If this event id has been seen, stop.
  BEGIN
    INSERT INTO public.billing_events (razorpay_event_id, user_id, kind, payload)
    VALUES (p_event_id, p_user_id, p_kind, p_payload);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'duplicate_event');
  END;

  IF p_user_id IS NULL THEN
    -- Recorded for forensics, but there is no row to update. Happens when a
    -- webhook arrives for a customer we cannot map back to a user.
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'unknown_user');
  END IF;

  SELECT last_event_at INTO v_existing
  FROM public.subscriptions WHERE user_id = p_user_id;

  IF v_existing IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_existing THEN
    RETURN jsonb_build_object('applied', FALSE, 'reason', 'stale_event');
  END IF;

  INSERT INTO public.subscriptions AS s (
    user_id, tier, status, razorpay_subscription_id, razorpay_customer_id,
    current_period_end, grace_until, cancel_at_period_end, last_event_at, updated_at
  ) VALUES (
    p_user_id, p_tier, p_status, p_subscription_id, p_customer_id,
    p_period_end, p_grace_until, COALESCE(p_cancel_at_period_end, FALSE),
    p_event_at, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier                     = EXCLUDED.tier,
    status                   = EXCLUDED.status,
    razorpay_subscription_id = COALESCE(EXCLUDED.razorpay_subscription_id, s.razorpay_subscription_id),
    razorpay_customer_id     = COALESCE(EXCLUDED.razorpay_customer_id,     s.razorpay_customer_id),
    current_period_end       = COALESCE(EXCLUDED.current_period_end,       s.current_period_end),
    grace_until              = EXCLUDED.grace_until,
    cancel_at_period_end     = EXCLUDED.cancel_at_period_end,
    last_event_at            = COALESCE(EXCLUDED.last_event_at, s.last_event_at),
    updated_at               = now();

  RETURN jsonb_build_object('applied', TRUE, 'tier', p_tier, 'status', p_status);
END;
$$;

-- Service role only. Deliberately NOT granted to authenticated.
REVOKE ALL ON FUNCTION public.apply_billing_event(
  TEXT, UUID, TEXT, JSONB, TEXT, public.plan_tier, TIMESTAMPTZ, TIMESTAMPTZ,
  BOOLEAN, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, authenticated, anon;
