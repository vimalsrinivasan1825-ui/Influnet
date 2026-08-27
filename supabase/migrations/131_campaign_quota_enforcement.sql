-- Migration 131: Campaign quota enforcement
--
-- Migration 127 added the three campaign-limit columns to billing_settings.
-- Nothing ever read them: get_entitlements() didn't return them, no route
-- checked them, and campaigns.publish / campaigns.apply sat in GATED_FEATURES
-- with no server enforcement behind them — a feature key that exists only so
-- a button can be hidden is exactly what that module's own header comment
-- says not to do.
--
-- This migration is the enforcement half. It follows the same two-layer
-- pattern the project cap already uses (migration 115):
--   1. get_entitlements() reports the real ceiling and real usage, so the app
--      layer (requireCampaignQuota in apps/web/src/lib/entitlements.ts) can
--      refuse before writing.
--   2. A BEFORE UPDATE trigger on campaigns re-checks at the DB layer,
--      off by default via db_enforcement_enabled — same defence-in-depth
--      posture as enforce_project_quota, for the same reason: a route can be
--      bypassed or have a bug, a trigger inside the same transaction as the
--      write cannot.
--
-- Applications get a WEEKLY quota, which plan_usage's existing
-- (user_id, meter, period_start) shape already supports — period_start is
-- just a DATE, and 'applications_week' with period_start = the Monday of
-- this week is a distinct key from 'requests_month', so no schema change is
-- needed. consume_weekly_quota() is consume_quota() with the period trunc
-- changed, kept as a separate function rather than a parameter so neither
-- caller has to pass a truncation unit it might get wrong.

-- ---------------------------------------------------------------------------
-- 1. get_entitlements() — report the campaign ceilings and real usage
-- ---------------------------------------------------------------------------
-- NOTE: this CREATE OR REPLACE carries forward every field migration 117
-- added (projectConversions / v_lifetime_projects) — it is easy to reintroduce
-- a regression here by copying an EARLIER version of this function as a
-- starting point instead of the one currently live. Diff against 117's
-- get_entitlements before touching this again.
CREATE OR REPLACE FUNCTION public.get_entitlements()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user              UUID := auth.uid();
  v_settings          public.billing_settings%ROWTYPE;
  v_sub               public.subscriptions%ROWTYPE;
  v_tier              public.plan_tier;
  v_active_projects   INTEGER;
  v_lifetime_projects INTEGER;
  v_requests          INTEGER;
  v_live_campaigns    INTEGER;
  v_applications_wk   INTEGER;
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
  -- including soft-deleted ones — see the module comment in migration 117.
  SELECT count(*) INTO v_lifetime_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user;

  SELECT COALESCE(used, 0) INTO v_requests
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'requests_month'
    AND period_start = date_trunc('month', now())::DATE;

  -- Live campaigns this brand currently has published. Counted from the rows
  -- themselves, the same way active projects are — nothing to drift.
  SELECT count(*) INTO v_live_campaigns
  FROM public.campaigns
  WHERE business_user_id = v_user
    AND status = 'live';

  -- Applications submitted this week. Not derivable from campaign_applications
  -- alone the way project counts are, because a withdrawn application still
  -- used up a slot for the week it was sent — see release_quota's own
  -- comment on why a spent unit isn't returned just because the thing it paid
  -- for didn't pan out. Tracked in plan_usage like requests_month.
  SELECT COALESCE(used, 0) INTO v_applications_wk
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'applications_week'
    AND period_start = date_trunc('week', now())::DATE;

  RETURN jsonb_build_object(
    'tier',   v_tier,
    'status', COALESCE(v_sub.status, 'inactive'),
    'currentPeriodEnd',   v_sub.current_period_end,
    'graceUntil',         v_sub.grace_until,
    'cancelAtPeriodEnd',  COALESCE(v_sub.cancel_at_period_end, FALSE),
    'limits', CASE WHEN v_tier = 'pro' THEN
      jsonb_build_object(
        'activeProjects',      NULL,
        'requestsPerMonth',    NULL,
        'projectConversions',  NULL,
        'shortlistSize',       NULL,
        'analyticsDays',       NULL,
        'liveCampaigns',       NULL,
        'applicationsPerWeek', NULL
      )
    ELSE
      jsonb_build_object(
        'activeProjects',      v_settings.free_active_projects,
        'requestsPerMonth',    v_settings.free_requests_per_month,
        'projectConversions',  v_settings.free_project_conversions,
        'shortlistSize',       v_settings.free_shortlist_size,
        'analyticsDays',       v_settings.free_analytics_days,
        'liveCampaigns',       v_settings.free_live_campaigns,
        'applicationsPerWeek', v_settings.free_applications_per_week
      )
    END,
    'freeLimits', jsonb_build_object(
      'activeProjects',      v_settings.free_active_projects,
      'requestsPerMonth',    v_settings.free_requests_per_month,
      'projectConversions',  v_settings.free_project_conversions,
      'shortlistSize',       v_settings.free_shortlist_size,
      'analyticsDays',       v_settings.free_analytics_days,
      'liveCampaigns',       v_settings.free_live_campaigns,
      'applicationsPerWeek', v_settings.free_applications_per_week
    ),
    'usage', jsonb_build_object(
      'activeProjects',       COALESCE(v_active_projects, 0),
      'requestsThisMonth',    COALESCE(v_requests, 0),
      'projectConversions',   COALESCE(v_lifetime_projects, 0),
      'liveCampaigns',        COALESCE(v_live_campaigns, 0),
      'applicationsThisWeek', COALESCE(v_applications_wk, 0)
    ),
    'price', jsonb_build_object(
      'paise',    v_settings.pro_price_paise,
      'currency', v_settings.pro_currency
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. consume_weekly_quota() — same shape as consume_quota(), week-truncated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_weekly_quota(
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
  v_period DATE := date_trunc('week', now())::DATE;
  v_used   INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_limit IS NULL THEN RETURN TRUE; END IF;

  INSERT INTO public.plan_usage (user_id, meter, period_start, used)
  VALUES (v_user, p_meter, v_period, 1)
  ON CONFLICT (user_id, meter, period_start) DO UPDATE
    SET used = public.plan_usage.used + 1
    WHERE public.plan_usage.used < p_limit
  RETURNING used INTO v_used;

  RETURN v_used IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_weekly_quota(TEXT, INTEGER) TO authenticated;

-- release_quota()'s weekly twin — same reasoning: consume_weekly_quota() must
-- run BEFORE the write it guards to stay atomic with it, so a write that then
-- fails for an unrelated reason (a duplicate application, a campaign that
-- expired between the check and the insert) has already spent a unit. Without
-- this, a double-tap on "Apply" burns two of a creator's weekly applications
-- for one that actually went through.
CREATE OR REPLACE FUNCTION public.release_weekly_quota(p_meter TEXT)
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
     AND period_start = date_trunc('week', now())::DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_weekly_quota(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The live-campaign cap, enforced where the transition actually happens
-- ---------------------------------------------------------------------------
-- Campaigns are created as 'draft' (POST /api/campaigns) and moved to 'live'
-- by PATCH — see the CHECK constraint on campaigns.status in migration 125.
-- The cap is about how many are LIVE at once, so it belongs on that
-- transition, not on INSERT. Same advisory-lock pattern as
-- enforce_project_quota, for the same reason: two publishes landing in the
-- same instant must not both see "2 of 3 used" and both proceed.
CREATE OR REPLACE FUNCTION public.enforce_campaign_quota()
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
  -- Only the transition INTO 'live' is gated. Editing a live campaign,
  -- closing one, or any other update is untouched.
  IF NEW.status <> 'live' OR OLD.status = 'live' THEN
    RETURN NEW;
  END IF;

  SELECT db_enforcement_enabled, free_live_campaigns
    INTO v_enabled, v_limit
  FROM public.billing_settings WHERE id;

  IF NOT COALESCE(v_enabled, FALSE) THEN RETURN NEW; END IF;
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  IF public.current_tier(NEW.business_user_id) <> 'free' THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('campaign_quota:' || NEW.business_user_id::TEXT));

  SELECT count(*) INTO v_count
  FROM public.campaigns
  WHERE business_user_id = NEW.business_user_id
    AND status = 'live'
    AND id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'campaign_quota_exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_quota_trg ON public.campaigns;
CREATE TRIGGER enforce_campaign_quota_trg
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_quota();
