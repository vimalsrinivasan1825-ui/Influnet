-- 117: Free-tier rework — requests uncapped, project conversions capped
--      lifetime at 5, the existing 2-concurrent-active cap unchanged.
--
-- Business decision 2026-08-13: sending a collaboration request should never
-- be restricted on Free — a brand can always reach out. What's scarce is
-- actually RUNNING a campaign. Two separate caps now apply to that, and they
-- stack:
--   • at most 2 active projects at once (unchanged, migration 115)
--   • at most 5 projects converted from a request, EVER — not monthly. A
--     monthly reset would make "free" indistinguishable from "5 fresh
--     projects every month forever", which defeats the point of a free tier.
--
-- ── Requests: NULL, not a new mechanism ────────────────────────────────────
-- `NULL` already means "no ceiling" everywhere in this schema (see
-- get_entitlements, isOverLimit in packages/core). Setting
-- free_requests_per_month to NULL reuses that convention instead of adding a
-- second one — requireQuota() in apps/web/src/lib/entitlements.ts already
-- returns "allowed" for a NULL limit, so no application code changes for
-- this half of the change. The column stays, nullable: a future "actually,
-- cap it again" is a data change, not a deploy.
--
-- ── Conversions: derived, not counted ──────────────────────────────────────
-- Same reasoning migration 115 used for active projects: counting every
-- campaign_projects row ever owned (no status filter, no
-- manually_deleted_at filter) is what makes the cap ungameable by deleting a
-- project and reconverting. A stored counter would need a matching release()
-- path and one more way to drift; a COUNT(*) cannot drift from the table it
-- counts.

-- ---------------------------------------------------------------------------
-- 1. billing_settings — the two limits, at rest
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_settings
  ALTER COLUMN free_requests_per_month DROP NOT NULL;

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS free_project_conversions INTEGER NOT NULL DEFAULT 5;

UPDATE public.billing_settings
SET free_requests_per_month = NULL,
    free_project_conversions = 5
WHERE id;

-- ---------------------------------------------------------------------------
-- 2. get_entitlements() — report the new limit and lifetime usage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_entitlements()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user             UUID := auth.uid();
  v_settings         public.billing_settings%ROWTYPE;
  v_sub              public.subscriptions%ROWTYPE;
  v_tier             public.plan_tier;
  v_active_projects  INTEGER;
  v_lifetime_projects INTEGER;
  v_requests         INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_settings FROM public.billing_settings WHERE id;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user;
  v_tier := public.current_tier(v_user);

  SELECT count(*) INTO v_active_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user
    AND status = 'active'
    AND manually_deleted_at IS NULL;

  -- Lifetime: every project this account has ever owned, any status,
  -- including soft-deleted ones — see the module comment above.
  SELECT count(*) INTO v_lifetime_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user;

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
    'limits', CASE WHEN v_tier = 'pro' THEN
      jsonb_build_object(
        'activeProjects',     NULL,
        'requestsPerMonth',   NULL,
        'projectConversions', NULL,
        'shortlistSize',      NULL,
        'analyticsDays',      NULL
      )
    ELSE
      jsonb_build_object(
        'activeProjects',     v_settings.free_active_projects,
        'requestsPerMonth',   v_settings.free_requests_per_month,
        'projectConversions', v_settings.free_project_conversions,
        'shortlistSize',      v_settings.free_shortlist_size,
        'analyticsDays',      v_settings.free_analytics_days
      )
    END,
    'freeLimits', jsonb_build_object(
      'activeProjects',     v_settings.free_active_projects,
      'requestsPerMonth',   v_settings.free_requests_per_month,
      'projectConversions', v_settings.free_project_conversions,
      'shortlistSize',      v_settings.free_shortlist_size,
      'analyticsDays',      v_settings.free_analytics_days
    ),
    'usage', jsonb_build_object(
      'activeProjects',     COALESCE(v_active_projects, 0),
      'requestsThisMonth',  COALESCE(v_requests, 0),
      'projectConversions', COALESCE(v_lifetime_projects, 0)
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
-- 3. enforce_project_quota() — active cap AND lifetime cap, both checked
-- ---------------------------------------------------------------------------
-- One advisory lock covers both: they key off the same owner and both must
-- serialise against a concurrent insert for the same reason (migration 115).
CREATE OR REPLACE FUNCTION public.enforce_project_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled        BOOLEAN;
  v_active_limit   INTEGER;
  v_lifetime_limit INTEGER;
  v_active_count   INTEGER;
  v_lifetime_count INTEGER;
BEGIN
  SELECT db_enforcement_enabled, free_active_projects, free_project_conversions
    INTO v_enabled, v_active_limit, v_lifetime_limit
  FROM public.billing_settings WHERE id;

  IF NOT COALESCE(v_enabled, FALSE) THEN RETURN NEW; END IF;

  -- Pro owners are never counted against either cap.
  IF public.current_tier(NEW.owner_user_id) <> 'free' THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('project_quota:' || NEW.owner_user_id::TEXT));

  IF v_active_limit IS NOT NULL THEN
    SELECT count(*) INTO v_active_count
    FROM public.campaign_projects
    WHERE owner_user_id = NEW.owner_user_id
      AND status = 'active'
      AND manually_deleted_at IS NULL;

    IF v_active_count >= v_active_limit THEN
      -- Mapped by the API to a 402/409 with an upgrade link. Kept
      -- machine-readable because the route matches on it.
      RAISE EXCEPTION 'project_quota_exceeded';
    END IF;
  END IF;

  IF v_lifetime_limit IS NOT NULL THEN
    SELECT count(*) INTO v_lifetime_count
    FROM public.campaign_projects
    WHERE owner_user_id = NEW.owner_user_id;

    IF v_lifetime_count >= v_lifetime_limit THEN
      RAISE EXCEPTION 'project_conversion_limit_exceeded';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition is unchanged (still BEFORE INSERT on campaign_projects);
-- re-declaring only because CREATE OR REPLACE FUNCTION above requires the
-- function to already exist, which DROP TRIGGER/CREATE TRIGGER does not
-- affect — included for clarity that no trigger-level change was needed.

-- ---------------------------------------------------------------------------
-- 4. Turn enforcement on
-- ---------------------------------------------------------------------------
-- Both caps above were already inert without this — `db_enforcement_enabled`
-- defaulted OFF in migration 115 so the feature could ship without instantly
-- rejecting inserts. Checked against live data before flipping it: no Free
-- owner currently exceeds 2 concurrent active projects, and the one owner at
-- exactly 5 lifetime projects sits AT the new boundary, not over it — their
-- next conversion attempt will now correctly be refused rather than silently
-- allowed forever.
UPDATE public.billing_settings SET db_enforcement_enabled = TRUE WHERE id;
