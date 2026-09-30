-- ═══════════════════════════════════════════════════════════════════════════
-- 192 — Subscriptions are a CREATOR product. Businesses are never billed.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now every account shared one freemium ladder, and most of the ceilings
-- that actually bit — active projects, live campaigns, request conversions —
-- bit BUSINESSES. That is now a product decision reversed: a business pays for
-- collaborations, not for the software, so the paid plan does not exist for it.
--
-- The important part is WHERE this is decided. Hiding the upgrade button would
-- have left the database still refusing a business's third live campaign with
-- `campaign_quota_exceeded` and no way to resolve it — a wall with no door.
-- So the rule lands here, in the two triggers and in get_entitlements(), and
-- the UI follows from what get_entitlements() reports.
--
-- `current_tier()` and `is_pro_public()` are deliberately NOT touched. They
-- answer "is this account paying?", which stays honestly `free` for a
-- business, so admin analytics (159/160) and broadcast tier segments (157)
-- keep telling the truth. Making current_tier() return 'pro' would have been a
-- shorter diff and would have quietly aimed every "Pro users" broadcast at the
-- entire brand roster.

-- ---------------------------------------------------------------------------
-- 1. billing_applies() — the one question the gates now ask first
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_applies(p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Creators only. An unknown user resolves to FALSE, which opens gates rather
  -- than closing them — the opposite of current_tier()'s bias, and correct
  -- here: this answers "should this account be metered at all", and metering
  -- someone we cannot identify is how you bill the wrong person.
  SELECT COALESCE(
    (SELECT p.role = 'influencer' FROM public.profiles p WHERE p.id = p_user),
    FALSE
  );
$$;

-- Same reasoning as current_tier(): it takes a user id, so granting it would
-- let any signed-in account probe another account's role one uuid at a time.
-- The SECURITY DEFINER callers below reach it regardless.
REVOKE EXECUTE ON FUNCTION public.billing_applies(UUID) FROM PUBLIC, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. enforce_project_quota() — carried forward from 117, one guard added
-- ---------------------------------------------------------------------------
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
  -- 192: a business owns the project row, and businesses are not billed.
  -- Checked before billing_settings is even read — there is no configuration
  -- of the freemium ladder that should reach a brand.
  IF NOT public.billing_applies(NEW.owner_user_id) THEN RETURN NEW; END IF;

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

-- ---------------------------------------------------------------------------
-- 3. enforce_campaign_quota() — carried forward from 131, one guard added
-- ---------------------------------------------------------------------------
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
  -- Only the transition INTO 'live' is gated.
  IF NEW.status <> 'live' OR OLD.status = 'live' THEN
    RETURN NEW;
  END IF;

  -- 192: campaigns are a business object, so this trigger is now inert for
  -- every account that can legitimately reach it. Kept rather than dropped so
  -- the ceiling is one boolean away if brand plans ever exist.
  IF NOT public.billing_applies(NEW.business_user_id) THEN RETURN NEW; END IF;

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

-- ---------------------------------------------------------------------------
-- 4. get_entitlements() — carried forward from 138, now role-aware
-- ---------------------------------------------------------------------------
-- Diffed against 138 (the currently live definition), not against 115/117/131.
-- Changes are confined to: v_billing_applies, the v_tier assignment, the
-- portfolio ceiling, `status`, and the new `billingApplies` key.
--
-- `billingApplies: false` is what the clients key off. Both use-entitlements
-- hooks already hide every price, upgrade button and Pro badge when the paid
-- product is absent — this simply makes "absent" a per-account answer instead
-- of a per-deployment one, so no client needed a new concept.
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
  v_billing_applies   BOOLEAN;
  v_active_projects   INTEGER;
  v_lifetime_projects INTEGER;
  v_requests          INTEGER;
  v_live_campaigns    INTEGER;
  v_applications_wk   INTEGER;
  v_portfolio_items   INTEGER;
  v_pinned_chats      INTEGER;
  v_profile_viewers   INTEGER;
  v_contact_reveals   INTEGER;
  v_invoices_month    INTEGER;
  v_peer_requests_mo  INTEGER;
  v_portfolio_limit   INTEGER;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_settings FROM public.billing_settings WHERE id;
  SELECT * INTO v_sub FROM public.subscriptions WHERE user_id = v_user;

  v_billing_applies := public.billing_applies(v_user);

  -- An account the plan does not apply to reports as 'pro' so that every
  -- existing ceiling check — here and in the TypeScript helpers, all of which
  -- short-circuit on tier = 'pro' — opens without a second code path to keep
  -- in step. `billingApplies` below is what stops the UI calling it a plan.
  v_tier := CASE
    WHEN v_billing_applies THEN public.current_tier(v_user)
    ELSE 'pro'::public.plan_tier
  END;

  SELECT count(*) INTO v_active_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user
    AND status = 'active'
    AND manually_deleted_at IS NULL;

  SELECT count(*) INTO v_lifetime_projects
  FROM public.campaign_projects
  WHERE owner_user_id = v_user;

  SELECT COALESCE(used, 0) INTO v_requests
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'requests_month'
    AND period_start = date_trunc('month', now())::DATE;

  SELECT count(*) INTO v_live_campaigns
  FROM public.campaigns
  WHERE business_user_id = v_user
    AND status = 'live';

  SELECT COALESCE(used, 0) INTO v_applications_wk
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'applications_week'
    AND period_start = date_trunc('week', now())::DATE;

  SELECT count(*) INTO v_portfolio_items
  FROM public.creator_portfolio_items
  WHERE user_id = v_user;

  SELECT count(*) INTO v_pinned_chats
  FROM public.conversation_pins
  WHERE user_id = v_user;

  SELECT count(*) INTO v_profile_viewers
  FROM public.creator_profile_views
  WHERE creator_id = v_user;

  SELECT count(*) INTO v_contact_reveals
  FROM public.business_contact_reveals
  WHERE creator_id = v_user;

  SELECT COALESCE(used, 0) INTO v_invoices_month
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'invoices_month'
    AND period_start = date_trunc('month', now())::DATE;

  SELECT COALESCE(used, 0) INTO v_peer_requests_mo
  FROM public.plan_usage
  WHERE user_id = v_user
    AND meter = 'peer_requests_month'
    AND period_start = date_trunc('month', now())::DATE;

  -- Portfolio is the one ceiling where Pro is a bigger number, not NULL — so
  -- it is also the one that needs saying out loud for an unbilled account,
  -- which gets no ceiling at all rather than the Pro number.
  v_portfolio_limit := CASE
    WHEN NOT v_billing_applies THEN NULL
    WHEN v_tier = 'pro' THEN v_settings.pro_portfolio_items
    ELSE v_settings.free_portfolio_items
  END;

  RETURN jsonb_build_object(
    'tier',   v_tier,
    'billingApplies', v_billing_applies,
    'status', CASE WHEN v_billing_applies
                   THEN COALESCE(v_sub.status, 'inactive')
                   ELSE 'not_applicable' END,
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
        'applicationsPerWeek', NULL,
        'portfolioItems',      v_portfolio_limit,
        'pinnedChats',         NULL,
        'profileViewers',      NULL,
        'contactReveals',      NULL,
        'connectedAccountsPerPlatform', NULL,
        'invoicesPerMonth',    NULL,
        'peerRequestsPerMonth', NULL
      )
    ELSE
      jsonb_build_object(
        'activeProjects',      v_settings.free_active_projects,
        'requestsPerMonth',    v_settings.free_requests_per_month,
        'projectConversions',  v_settings.free_project_conversions,
        'shortlistSize',       v_settings.free_shortlist_size,
        'analyticsDays',       v_settings.free_analytics_days,
        'liveCampaigns',       v_settings.free_live_campaigns,
        'applicationsPerWeek', v_settings.free_applications_per_week,
        'portfolioItems',      v_portfolio_limit,
        'pinnedChats',         v_settings.free_pinned_chats,
        'profileViewers',      v_settings.free_profile_viewers,
        'contactReveals',      v_settings.free_contact_reveals,
        'connectedAccountsPerPlatform', v_settings.free_connected_accounts,
        'invoicesPerMonth',    v_settings.free_invoices_per_month,
        'peerRequestsPerMonth', v_settings.free_peer_requests_per_month
      )
    END,
    'freeLimits', jsonb_build_object(
      'activeProjects',      v_settings.free_active_projects,
      'requestsPerMonth',    v_settings.free_requests_per_month,
      'projectConversions',  v_settings.free_project_conversions,
      'shortlistSize',       v_settings.free_shortlist_size,
      'analyticsDays',       v_settings.free_analytics_days,
      'liveCampaigns',       v_settings.free_live_campaigns,
      'applicationsPerWeek', v_settings.free_applications_per_week,
      'portfolioItems',      v_settings.free_portfolio_items,
      'pinnedChats',         v_settings.free_pinned_chats,
      'profileViewers',      v_settings.free_profile_viewers,
      'contactReveals',      v_settings.free_contact_reveals,
      'connectedAccountsPerPlatform', v_settings.free_connected_accounts,
      'invoicesPerMonth',    v_settings.free_invoices_per_month,
      'peerRequestsPerMonth', v_settings.free_peer_requests_per_month
    ),
    'usage', jsonb_build_object(
      'activeProjects',       COALESCE(v_active_projects, 0),
      'requestsThisMonth',    COALESCE(v_requests, 0),
      'projectConversions',   COALESCE(v_lifetime_projects, 0),
      'liveCampaigns',        COALESCE(v_live_campaigns, 0),
      'applicationsThisWeek', COALESCE(v_applications_wk, 0),
      'portfolioItems',       COALESCE(v_portfolio_items, 0),
      'pinnedChats',          COALESCE(v_pinned_chats, 0),
      'profileViewers',       COALESCE(v_profile_viewers, 0),
      'contactReveals',       COALESCE(v_contact_reveals, 0),
      'invoicesThisMonth',    COALESCE(v_invoices_month, 0),
      'peerRequestsThisMonth', COALESCE(v_peer_requests_mo, 0)
    ),
    'price', jsonb_build_object(
      'paise',    v_settings.pro_price_paise,
      'currency', v_settings.pro_currency
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_entitlements() TO authenticated;
