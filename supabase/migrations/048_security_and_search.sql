-- 048: Security hardening + discover search
-- 1. PII lockdown: email/phone on profiles no longer readable by client roles
-- 2. get_own_profile(): full own-row access for the profile API
-- 3. search_influencers / search_businesses: server-side discover search with keyset pagination
-- 4. record_profile_view: dedup so refreshes/spam don't inflate counts
-- 5. collab_requests: at most one pending request per (from, to) pair

-- ============================================================
-- 1. PII lockdown (column-level grants)
-- Public pages read via SECURITY DEFINER RPCs, so anon needs no direct access.
-- Authenticated users may read only non-sensitive columns; email/phone are
-- reachable solely through get_own_profile() / admin service-role calls.
-- ============================================================
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, role, name, location, created_at, updated_at)
  ON public.profiles TO authenticated;

-- ============================================================
-- 2. Own full profile (used by GET /api/profile)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_profile() FROM anon;

-- ============================================================
-- 3. Discover search RPCs + trigram indexes
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS profiles_name_trgm_idx
  ON public.profiles USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS influencer_profiles_username_trgm_idx
  ON public.influencer_profiles USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS influencer_profiles_headline_trgm_idx
  ON public.influencer_profiles USING gin (headline gin_trgm_ops);
CREATE INDEX IF NOT EXISTS business_profiles_company_trgm_idx
  ON public.business_profiles USING gin (company_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_influencers(
  p_q TEXT DEFAULT NULL,
  p_niche TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_cursor UUID DEFAULT NULL,
  p_limit INT DEFAULT 24,
  p_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_q TEXT := nullif(trim(coalesce(p_q, '')), '');
  v_loc TEXT := nullif(trim(coalesce(p_location, '')), '');
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'user_id', ip.user_id,
      'username', ip.username,
      'bio', ip.bio,
      'headline', ip.headline,
      'niche', coalesce(ip.niche, '[]'::jsonb),
      'instagram_handle', ip.instagram_handle,
      'youtube_handle', ip.youtube_handle,
      'availability_status', ip.availability_status,
      'profile', jsonb_build_object('id', p.id, 'name', p.name, 'location', p.location)
    ) AS row_data
    FROM public.influencer_profiles ip
    JOIN public.profiles p ON p.id = ip.user_id
    WHERE p.role = 'influencer'
      AND ip.user_id <> auth.uid()
      AND (p_id IS NULL OR ip.user_id = p_id)
      AND (p_cursor IS NULL OR ip.user_id > p_cursor)
      AND (v_q IS NULL
        OR p.name ILIKE '%' || v_q || '%'
        OR ip.username ILIKE '%' || v_q || '%'
        OR ip.headline ILIKE '%' || v_q || '%'
        OR ip.bio ILIKE '%' || v_q || '%')
      AND (p_niche IS NULL OR ip.niche ? p_niche)
      AND (v_loc IS NULL
        OR p.location ILIKE '%' || v_loc || '%'
        OR ip.city ILIKE '%' || v_loc || '%'
        OR ip.state ILIKE '%' || v_loc || '%')
    ORDER BY ip.user_id
    LIMIT v_limit
  ) sub;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_businesses(
  p_q TEXT DEFAULT NULL,
  p_industry TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_cursor UUID DEFAULT NULL,
  p_limit INT DEFAULT 24,
  p_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_q TEXT := nullif(trim(coalesce(p_q, '')), '');
  v_loc TEXT := nullif(trim(coalesce(p_location, '')), '');
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(row_data), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'user_id', bp.user_id,
      'company_name', bp.company_name,
      'industry', bp.industry,
      'tagline', bp.tagline,
      'website', bp.website,
      'profile', jsonb_build_object('id', p.id, 'name', p.name, 'location', p.location)
    ) AS row_data
    FROM public.business_profiles bp
    JOIN public.profiles p ON p.id = bp.user_id
    WHERE p.role = 'business_owner'
      AND bp.user_id <> auth.uid()
      AND coalesce(bp.approval_status, 'approved') = 'approved'
      AND (p_id IS NULL OR bp.user_id = p_id)
      AND (p_cursor IS NULL OR bp.user_id > p_cursor)
      AND (v_q IS NULL
        OR p.name ILIKE '%' || v_q || '%'
        OR bp.company_name ILIKE '%' || v_q || '%'
        OR bp.tagline ILIKE '%' || v_q || '%')
      AND (p_industry IS NULL OR bp.industry ILIKE '%' || p_industry || '%')
      AND (v_loc IS NULL
        OR p.location ILIKE '%' || v_loc || '%'
        OR bp.city ILIKE '%' || v_loc || '%'
        OR bp.state ILIKE '%' || v_loc || '%')
    ORDER BY bp.user_id
    LIMIT v_limit
  ) sub;

  RETURN v_rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_influencers(TEXT, TEXT, TEXT, UUID, INT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_businesses(TEXT, TEXT, TEXT, UUID, INT, UUID) FROM anon;

-- ============================================================
-- 4. Profile view dedup
-- Authenticated viewers: one raw view per influencer per hour.
-- Anonymous viewers: at most one raw view per influencer per minute (anti-spam cap).
-- The per-business aggregate keeps its own upsert behaviour.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_profile_view(
  p_influencer_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_influencer_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Never count creators viewing themselves
  IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id = p_influencer_user_id THEN
    RETURN;
  END IF;

  IF p_viewer_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.profile_views
      WHERE influencer_user_id = p_influencer_user_id
        AND viewer_user_id = p_viewer_user_id
        AND viewed_at > now() - interval '1 hour'
    ) THEN
      RETURN;
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.profile_views
      WHERE influencer_user_id = p_influencer_user_id
        AND viewer_user_id IS NULL
        AND viewed_at > now() - interval '1 minute'
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.profile_views (influencer_user_id, viewer_user_id)
  VALUES (p_influencer_user_id, p_viewer_user_id);

  IF p_viewer_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_viewer_user_id AND role = 'business_owner') THEN
      INSERT INTO public.creator_profile_views (creator_id, business_id, view_count, last_viewed_at)
      VALUES (p_influencer_user_id, p_viewer_user_id, 1, now())
      ON CONFLICT (creator_id, business_id)
      DO UPDATE SET view_count = creator_profile_views.view_count + 1, last_viewed_at = now();
    END IF;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS profile_views_dedup_idx
  ON public.profile_views (influencer_user_id, viewer_user_id, viewed_at DESC);

-- ============================================================
-- 5. One pending collab request per (from, to) pair
-- ============================================================
-- Remove existing duplicates first (keep the oldest)
DELETE FROM public.collab_requests a
USING public.collab_requests b
WHERE a.status = 'pending' AND b.status = 'pending'
  AND a.from_user_id = b.from_user_id
  AND a.to_user_id = b.to_user_id
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS collab_requests_unique_pending
  ON public.collab_requests (from_user_id, to_user_id)
  WHERE status = 'pending';
