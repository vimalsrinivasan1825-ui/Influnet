-- 113: Collaboration counts on both sides of the marketplace, and profile-view
--      tracking for businesses.
--
-- Two gaps this closes.
--
-- 1. NOBODY CAN SEE WHO HAS ACTUALLY WORKED WITH WHOM.
--    A creator's public profile shows followers and a niche; a business profile
--    shows an industry. Neither shows the one number a marketplace runs on —
--    "this account has completed N projects with M different partners". That is
--    the trust signal, and it was nowhere in the product.
--
--    Derived, never stored. `public.connections` (migration 029) was built to
--    hold exactly these counters (projects_completed, messages_count) and has
--    sat at ZERO rows since the day it shipped because nothing ever wrote to
--    it — which is the whole argument against denormalising this. Counters
--    that a feature must remember to increment are wrong the first time
--    someone forgets, and they are silently wrong. These functions read
--    campaign_projects and collab_requests, the rows that already record the
--    facts, so they cover history from before this migration and cannot drift.
--    Same reasoning as get_user_activity (073) and get_platform_activity (099).
--
-- 2. BUSINESS PROFILES HAVE NO VIEW TRACKING AT ALL.
--    profile_views is keyed on influencer_user_id, so a brand has no idea how
--    many creators looked at it. Creators pick brands too, and a brand with no
--    idea whether its profile is being seen cannot tell a positioning problem
--    from a supply problem. business_profile_views mirrors profile_views rather
--    than generalising it: profile_views already holds real rows, and rewriting
--    a live table's shape to save one table is a bad trade.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Business profile views
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_profile_views (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Same daily-grain de-duplication profile_views uses: one row per viewer per
  -- day, so a reload loop can't inflate the number.
  viewed_on         DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE UNIQUE INDEX IF NOT EXISTS business_profile_views_unique_daily
  ON public.business_profile_views (business_user_id, viewer_user_id, viewed_on);
CREATE INDEX IF NOT EXISTS business_profile_views_business_idx
  ON public.business_profile_views (business_user_id, viewed_at DESC);

ALTER TABLE public.business_profile_views ENABLE ROW LEVEL SECURITY;

-- A business reads its OWN view log and nobody else's. Mirrors
-- profile_views_influencer_read.
DROP POLICY IF EXISTS business_profile_views_owner_read ON public.business_profile_views;
CREATE POLICY business_profile_views_owner_read ON public.business_profile_views
  FOR SELECT USING (business_user_id = auth.uid());

-- Writes go through the SECURITY DEFINER function below, which is what pins the
-- viewer to auth.uid(). The permissive INSERT policy matches profile_views_insert.
DROP POLICY IF EXISTS business_profile_views_insert ON public.business_profile_views;
CREATE POLICY business_profile_views_insert ON public.business_profile_views
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.business_profile_views IS
  'One row per (business, viewer, day). Written only by record_business_profile_view().';

CREATE OR REPLACE FUNCTION public.record_business_profile_view(
  p_business_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- Deliberately no p_viewer_user_id parameter. record_profile_view has one and
  -- has to spend two checks rejecting any value that isn't the caller; not
  -- accepting it in the first place makes spoofing a view unrepresentable.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- Never count a business visiting its own profile.
  IF v_caller = p_business_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.business_profile_views (business_user_id, viewer_user_id)
  VALUES (p_business_user_id, v_caller)
  ON CONFLICT (business_user_id, viewer_user_id, viewed_on) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_business_profile_view(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Collaboration stats — the counts shown on a profile
-- ═══════════════════════════════════════════════════════════════════════════

-- Works for either role; the caller does not have to know which one p_user_id
-- is, because the project columns are role-shaped (owner = business,
-- counterparty = creator) and the union below covers both sides.
--
-- Safe to expose publicly: it returns COUNTS ONLY. Who the partners are, what
-- was paid and what stage anything is at stay private — those live in tables
-- with their own RLS and are not read here.
CREATE OR REPLACE FUNCTION public.get_collaboration_stats(p_user_id UUID)
RETURNS TABLE (
  partners_total      INT,   -- distinct accounts this user has ever had a project with
  projects_total      INT,
  projects_active     INT,
  projects_completed  INT,
  projects_cancelled  INT,
  requests_accepted   INT,   -- accepted collab requests (connections, pre-project)
  first_collab_at     TIMESTAMPTZ,
  last_collab_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH mine AS (
    SELECT
      CASE WHEN cp.owner_user_id = p_user_id
           THEN cp.counterparty_user_id ELSE cp.owner_user_id END AS partner_id,
      cp.status,
      cp.created_at
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id)
      -- Terms nobody accepted are not a collaboration. Migration 071 keeps
      -- these out of project listings for the same reason; counting them here
      -- would let anyone inflate their profile by proposing terms into the void.
      AND cp.status <> 'pending_acceptance'
  ),
  reqs AS (
    SELECT count(*)::INT AS n
    FROM public.collab_requests cr
    WHERE (cr.from_user_id = p_user_id OR cr.to_user_id = p_user_id)
      AND cr.status = 'accepted'
  )
  SELECT
    (SELECT count(DISTINCT partner_id) FROM mine)::INT,
    (SELECT count(*) FROM mine)::INT,
    (SELECT count(*) FROM mine WHERE status = 'active')::INT,
    (SELECT count(*) FROM mine WHERE status = 'completed')::INT,
    (SELECT count(*) FROM mine WHERE status = 'cancelled')::INT,
    (SELECT n FROM reqs),
    (SELECT min(created_at) FROM mine),
    (SELECT max(created_at) FROM mine);
$$;

GRANT EXECUTE ON FUNCTION public.get_collaboration_stats(UUID) TO anon, authenticated;

COMMENT ON FUNCTION public.get_collaboration_stats(UUID) IS
  'Public collaboration counters for a profile. Counts only — no partner identities.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Profile-view stats — self-scoped
-- ═══════════════════════════════════════════════════════════════════════════

-- Reads whichever view table matches the account's role, so a caller does not
-- branch on role. Self-scoped: a profile's view log is its own business, and
-- letting one account read another's would expose who has been researching whom.
CREATE OR REPLACE FUNCTION public.get_profile_view_stats(
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  views_total        INT,
  views_in_window    INT,
  unique_viewers     INT,
  viewers_in_window  INT,
  last_viewed_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role   TEXT;
  v_days   INT := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since  TIMESTAMPTZ;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  v_since := now() - make_interval(days => v_days);

  SELECT role INTO v_role FROM public.profiles WHERE id = v_caller;

  IF v_role = 'business_owner' THEN
    RETURN QUERY
      SELECT count(*)::INT,
             count(*) FILTER (WHERE viewed_at >= v_since)::INT,
             count(DISTINCT viewer_user_id)::INT,
             count(DISTINCT viewer_user_id) FILTER (WHERE viewed_at >= v_since)::INT,
             max(viewed_at)
      FROM public.business_profile_views
      WHERE business_user_id = v_caller;
  ELSE
    RETURN QUERY
      SELECT count(*)::INT,
             count(*) FILTER (WHERE viewed_at >= v_since)::INT,
             count(DISTINCT viewer_user_id)::INT,
             count(DISTINCT viewer_user_id) FILTER (WHERE viewed_at >= v_since)::INT,
             max(viewed_at)
      FROM public.profile_views
      WHERE influencer_user_id = v_caller;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_view_stats(INT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Admin engagement stats
-- ═══════════════════════════════════════════════════════════════════════════

-- get_admin_growth_series (098) reports signups as ONE number. "How many
-- business owners signed up" is a different question from "how many creators
-- did", and on a two-sided marketplace it is the more important one — supply
-- and demand growing at different rates is the thing you need to see early.
CREATE OR REPLACE FUNCTION public.get_admin_engagement_stats(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_days  INT := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since TIMESTAMPTZ;
  v_out   JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_since := now() - make_interval(days => v_days);

  SELECT jsonb_build_object(
    'window_days', v_days,

    'signups', jsonb_build_object(
      'businesses_total',    (SELECT count(*) FROM profiles WHERE role = 'business_owner'),
      'creators_total',      (SELECT count(*) FROM profiles WHERE role = 'influencer'),
      'businesses_in_window',(SELECT count(*) FROM profiles WHERE role = 'business_owner' AND created_at >= v_since),
      'creators_in_window',  (SELECT count(*) FROM profiles WHERE role = 'influencer'     AND created_at >= v_since)
    ),

    'business_approval', jsonb_build_object(
      'approved',       (SELECT count(*) FROM business_profiles WHERE approval_status = 'approved'),
      'pending_review', (SELECT count(*) FROM business_profiles WHERE approval_status = 'pending_review'),
      'rejected',       (SELECT count(*) FROM business_profiles WHERE approval_status = 'rejected')
    ),

    -- "How many business owners actually looked at a creator" — the demand-side
    -- engagement number. A business that signs up and never opens a profile is
    -- a very different problem from one that browses and never sends a request,
    -- and the funnel could not previously tell them apart.
    'creator_profile_views', jsonb_build_object(
      'total',                (SELECT count(*) FROM profile_views),
      'in_window',            (SELECT count(*) FROM profile_views WHERE viewed_at >= v_since),
      'distinct_viewers',     (SELECT count(DISTINCT viewer_user_id) FROM profile_views),
      'businesses_who_viewed',(SELECT count(DISTINCT pv.viewer_user_id)
                                 FROM profile_views pv
                                 JOIN profiles p ON p.id = pv.viewer_user_id
                                WHERE p.role = 'business_owner'),
      'businesses_who_viewed_in_window',
                              (SELECT count(DISTINCT pv.viewer_user_id)
                                 FROM profile_views pv
                                 JOIN profiles p ON p.id = pv.viewer_user_id
                                WHERE p.role = 'business_owner' AND pv.viewed_at >= v_since)
    ),

    'business_profile_views', jsonb_build_object(
      'total',            (SELECT count(*) FROM business_profile_views),
      'in_window',        (SELECT count(*) FROM business_profile_views WHERE viewed_at >= v_since),
      'distinct_viewers', (SELECT count(DISTINCT viewer_user_id) FROM business_profile_views)
    ),

    -- The demand-side funnel in one place: signed up → looked → asked → worked.
    'business_funnel', jsonb_build_object(
      'signed_up',      (SELECT count(*) FROM profiles WHERE role = 'business_owner'),
      'viewed_creator', (SELECT count(DISTINCT pv.viewer_user_id)
                           FROM profile_views pv
                           JOIN profiles p ON p.id = pv.viewer_user_id
                          WHERE p.role = 'business_owner'),
      'sent_request',   (SELECT count(DISTINCT from_user_id) FROM collab_requests),
      'started_project',(SELECT count(DISTINCT owner_user_id)
                           FROM campaign_projects WHERE status <> 'pending_acceptance'),
      'completed_project', (SELECT count(DISTINCT owner_user_id)
                           FROM campaign_projects WHERE status = 'completed')
    ),

    'projects', jsonb_build_object(
      'total',     (SELECT count(*) FROM campaign_projects WHERE status <> 'pending_acceptance'),
      'active',    (SELECT count(*) FROM campaign_projects WHERE status = 'active'),
      'completed', (SELECT count(*) FROM campaign_projects WHERE status = 'completed'),
      'cancelled', (SELECT count(*) FROM campaign_projects WHERE status = 'cancelled'),
      'in_window', (SELECT count(*) FROM campaign_projects
                     WHERE status <> 'pending_acceptance' AND created_at >= v_since)
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_engagement_stats(INT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Retire the dead counter table
-- ═══════════════════════════════════════════════════════════════════════════

-- `connections` (029) has never held a row and nothing in apps/ or packages/
-- references it. Left in place — dropping a table is not worth the risk for a
-- cleanup — but marked so the next person doesn't wire a feature to a table
-- whose counters no writer maintains.
COMMENT ON TABLE public.connections IS
  'DEPRECATED (113): never populated, no reader or writer in the codebase. '
  'Use get_collaboration_stats(user_id), which derives the same counters from '
  'campaign_projects/collab_requests and therefore cannot drift.';
