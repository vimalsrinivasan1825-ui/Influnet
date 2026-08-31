-- Migration 138: the remaining Release-1 Free-tier ceilings
--
-- The founder's list (2026-08-31): portfolio 5, pinned chats 3, "who viewed
-- your profile" 5, business-contact reveals 5, connected accounts per platform
-- 1 (Pro unlocks more), invoices 10/month, creator→creator requests 10/month.
--
-- This migration is the SHARED half — the numbers at rest and one rewrite of
-- get_entitlements() to report every ceiling and its usage. The enforcement
-- for each (a trigger, a quota meter, or a read gate) and the UI land in their
-- own per-feature migrations/commits so the founder can roll them one at a
-- time. Every column and jsonb key added here is inert until that feature's
-- code ships — nothing reads a ceiling it doesn't yet enforce.
--
-- Two small tables are created here rather than in their feature migrations,
-- for one reason only: get_entitlements() counts rows in them, and a function
-- that references a missing relation fails to run. They carry no behaviour
-- yet — RLS + the columns, nothing else.
--
-- NOTE (carried forward from migration 131's header): this CREATE OR REPLACE
-- of get_entitlements() must preserve EVERY field the live version returns.
-- It is based on migration 131's version (the current one) — diff against that
-- before touching this again, never against an earlier copy.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. billing_settings — the ceilings at rest. NULL anywhere = "no limit".
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS free_portfolio_items        INTEGER NOT NULL DEFAULT 5,
  -- Pro is not unlimited here: a portfolio is a wall the public page renders,
  -- and the old flat cap of 24 (migration 087) was a performance ceiling, not
  -- a billing one. Pro raises the wall, it doesn't remove it.
  ADD COLUMN IF NOT EXISTS pro_portfolio_items         INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS free_pinned_chats           INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS free_profile_viewers        INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS free_contact_reveals        INTEGER NOT NULL DEFAULT 5,
  -- "per platform" — a Free creator gets one verified handle each on Instagram,
  -- YouTube, etc. (the status quo); Pro can connect several on one platform.
  ADD COLUMN IF NOT EXISTS free_connected_accounts     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS free_invoices_per_month     INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS free_peer_requests_per_month INTEGER NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.billing_settings.free_portfolio_items IS
  'Manual portfolio items a Free creator may add. Platform-derived entries (completed projects) do not count.';
COMMENT ON COLUMN public.billing_settings.free_contact_reveals IS
  'Distinct businesses whose contact card a Free creator may reveal, lifetime.';
COMMENT ON COLUMN public.billing_settings.free_profile_viewers IS
  'Most-recent profile viewers a Free creator can see identified; the rest are a count.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. conversation_pins — a per-user property of a conversation
-- ═══════════════════════════════════════════════════════════════════════════
-- Pinning is per-user, not per-conversation, so it cannot live in the Stream
-- channel (shared by both sides) — it belongs here. Feature migration adds the
-- BEFORE INSERT quota trigger; this is just the store.
CREATE TABLE IF NOT EXISTS public.conversation_pins (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS conversation_pins_user_idx
  ON public.conversation_pins (user_id, pinned_at DESC);

ALTER TABLE public.conversation_pins ENABLE ROW LEVEL SECURITY;

-- Read / manage only your own pins, and only for a conversation you are in.
DROP POLICY IF EXISTS conversation_pins_select_own ON public.conversation_pins;
CREATE POLICY conversation_pins_select_own ON public.conversation_pins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS conversation_pins_write_own ON public.conversation_pins;
CREATE POLICY conversation_pins_write_own ON public.conversation_pins
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_conversation_participant(conversation_id)
  );

DROP POLICY IF EXISTS conversation_pins_delete_own ON public.conversation_pins;
CREATE POLICY conversation_pins_delete_own ON public.conversation_pins
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE UPDATE, TRUNCATE ON public.conversation_pins FROM authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. business_contact_reveals — the lifetime "I unlocked this brand's contact"
-- ═══════════════════════════════════════════════════════════════════════════
-- Same shape and reasoning as project conversions: the cap is COUNT(*) of
-- these rows for the creator, which cannot drift and cannot be gamed by
-- re-revealing (the row already exists, so it never re-charges).
CREATE TABLE IF NOT EXISTS public.business_contact_reveals (
  creator_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (creator_id, business_id),
  CONSTRAINT business_contact_reveals_distinct CHECK (creator_id <> business_id)
);

CREATE INDEX IF NOT EXISTS business_contact_reveals_creator_idx
  ON public.business_contact_reveals (creator_id, revealed_at DESC);

ALTER TABLE public.business_contact_reveals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_contact_reveals_select_own ON public.business_contact_reveals;
CREATE POLICY business_contact_reveals_select_own ON public.business_contact_reveals
  FOR SELECT TO authenticated USING (auth.uid() = creator_id);

-- No INSERT policy: reveals are written by the route with the service role
-- after the quota check, so a creator cannot mint one by talking to PostgREST.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.business_contact_reveals FROM authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_entitlements() — report every ceiling and its real usage
-- ═══════════════════════════════════════════════════════════════════════════
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
  v_tier := public.current_tier(v_user);

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

  -- ── 138 additions ──────────────────────────────────────────────────────
  -- Manual portfolio items only. Platform-derived entries are computed live
  -- by get_creator_portfolio() and are not rows here.
  SELECT count(*) INTO v_portfolio_items
  FROM public.creator_portfolio_items
  WHERE user_id = v_user;

  SELECT count(*) INTO v_pinned_chats
  FROM public.conversation_pins
  WHERE user_id = v_user;

  -- Total distinct businesses that have viewed this creator's profile. The UI
  -- shows the first `free_profile_viewers` identified and this total, so a
  -- Free creator sees "5 shown · 23 in total".
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

  -- Portfolio is the one ceiling where Pro is a bigger number, not NULL.
  v_portfolio_limit := CASE
    WHEN v_tier = 'pro' THEN v_settings.pro_portfolio_items
    ELSE v_settings.free_portfolio_items
  END;

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
        'applicationsPerWeek', NULL,
        'portfolioItems',      v_settings.pro_portfolio_items,
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
        'portfolioItems',      v_settings.free_portfolio_items,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A monthly-quota release twin already exists (release_quota, migration
--    115). invoices_month and peer_requests_month reuse consume_quota() /
--    release_quota() unchanged — they are just new meter names, the same way
--    applications_week reused the plan_usage shape.
-- ═══════════════════════════════════════════════════════════════════════════
