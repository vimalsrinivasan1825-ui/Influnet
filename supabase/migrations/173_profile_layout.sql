-- Migration 173: creator-chosen profile layout, and real dates on platform work
--
-- 1. influencer_profiles.profile_layout — which design each public-profile
--    section uses, which posts are featured, and the creator's closing note.
--    Opt-in by omission, like profile_section_visibility (088): '{}' means
--    "all defaults", and a missing key is the default for that one section, so
--    new designs need no backfill. The shape is defined and sanitised in
--    packages/core/src/profile-layout.ts; every reader runs it through
--    sanitizeProfileLayout, so the database only has to bound the size.
--
--    Written through set_my_profile_layout(), not a column grant. The function
--    has no user parameter at all — it writes auth.uid()'s own row — so there
--    is nothing for a caller to lie about, and influencer_profiles' column
--    allow-list (083) stays exactly as it was.
--
-- 2. Completed projects in the portfolio were dated by campaign_projects.
--    updated_at. Any later write to the project (a backfill, a trigger touching
--    the row) moved the date, which is how every one of a creator's completed
--    campaigns came to read the same day and minute. completed_at is the date
--    the work was actually done; updated_at stays only as the fallback for a
--    row that somehow has no completed_at.

ALTER TABLE public.influencer_profiles
  ADD COLUMN IF NOT EXISTS profile_layout JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.influencer_profiles
  DROP CONSTRAINT IF EXISTS influencer_profiles_profile_layout_shape;
ALTER TABLE public.influencer_profiles
  ADD CONSTRAINT influencer_profiles_profile_layout_shape
  CHECK (jsonb_typeof(profile_layout) = 'object' AND pg_column_size(profile_layout) <= 8192);

-- ── Public read ─────────────────────────────────────────────────────────
-- influencer_profiles has no anonymous SELECT policy, so the public page reads
-- this the same way it reads section visibility.
CREATE OR REPLACE FUNCTION public.get_profile_layout(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(profile_layout, '{}'::jsonb)
  FROM public.influencer_profiles
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_layout(UUID) TO anon, authenticated;

-- ── Owner write ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_my_profile_layout(p_layout JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_saved JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_layout IS NULL OR jsonb_typeof(p_layout) <> 'object' THEN
    RAISE EXCEPTION 'layout must be an object' USING ERRCODE = '22023';
  END IF;

  UPDATE public.influencer_profiles
     SET profile_layout = p_layout,
         updated_at = now()
   WHERE user_id = v_uid
  RETURNING profile_layout INTO v_saved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no creator profile for this account' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_profile_layout(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_profile_layout(JSONB) TO authenticated;

-- ── Portfolio reads: identical to 088 except the platform date ────────
CREATE OR REPLACE FUNCTION public.get_creator_portfolio(p_user_id UUID, p_limit INT DEFAULT 24)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH manual AS (
    SELECT
      pi.id::text                AS id,
      'manual'::text             AS source,
      false                      AS verified,
      pi.title,
      pi.brand_name,
      pi.description,
      pi.platform,
      pi.content_url,
      pi.thumbnail_url,
      pi.views,
      pi.likes,
      coalesce(pi.published_at::timestamptz, pi.created_at) AS happened_at,
      pi.sort_order
    FROM public.creator_portfolio_items pi
    WHERE pi.user_id = p_user_id
      AND pi.is_visible = true
  ),
  platform_work AS (
    SELECT
      cp.id::text                AS id,
      'platform'::text           AS source,
      true                       AS verified,
      coalesce(nullif(trim(cp.title), ''), 'Collaboration') AS title,
      coalesce(nullif(trim(bp.company_name), ''), pr.name)  AS brand_name,
      NULL::text                 AS description,
      'other'::text              AS platform,
      NULL::text                 AS content_url,
      NULL::text                 AS thumbnail_url,
      NULL::bigint               AS views,
      NULL::bigint               AS likes,
      coalesce(cp.completed_at, cp.updated_at) AS happened_at,
      -1                         AS sort_order
    FROM public.campaign_projects cp
    JOIN public.profiles pr ON pr.id = cp.owner_user_id
    LEFT JOIN public.business_profiles bp ON bp.user_id = cp.owner_user_id
    WHERE cp.counterparty_user_id = p_user_id
      AND cp.status = 'completed'
  ),
  merged AS (
    SELECT * FROM manual
    UNION ALL
    SELECT * FROM platform_work
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'source', source, 'verified', verified, 'title', title,
        'brand_name', brand_name, 'description', description, 'platform', platform,
        'content_url', content_url, 'thumbnail_url', thumbnail_url,
        'views', views, 'likes', likes, 'happened_at', happened_at
      )
      ORDER BY sort_order ASC, happened_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT * FROM merged ORDER BY sort_order ASC, happened_at DESC
    LIMIT greatest(coalesce(p_limit, 24), 0)
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_portfolio(UUID, INT) TO anon, authenticated;

-- ── Owner read: everything, including hidden ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_portfolio(p_limit INT DEFAULT 24)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH manual AS (
    SELECT
      pi.id::text                AS id,
      'manual'::text             AS source,
      false                      AS verified,
      pi.is_visible,
      pi.title,
      pi.brand_name,
      pi.description,
      pi.platform,
      pi.content_url,
      pi.thumbnail_url,
      pi.views,
      pi.likes,
      coalesce(pi.published_at::timestamptz, pi.created_at) AS happened_at,
      pi.sort_order
    FROM public.creator_portfolio_items pi
    WHERE pi.user_id = auth.uid()
  ),
  platform_work AS (
    SELECT
      cp.id::text                AS id,
      'platform'::text           AS source,
      true                       AS verified,
      -- Platform entries have no hide switch yet (see the migration header);
      -- always reported visible so the owner's list doesn't imply a control
      -- that does not exist.
      true                       AS is_visible,
      coalesce(nullif(trim(cp.title), ''), 'Collaboration') AS title,
      coalesce(nullif(trim(bp.company_name), ''), pr.name)  AS brand_name,
      NULL::text                 AS description,
      'other'::text              AS platform,
      NULL::text                 AS content_url,
      NULL::text                 AS thumbnail_url,
      NULL::bigint               AS views,
      NULL::bigint               AS likes,
      coalesce(cp.completed_at, cp.updated_at) AS happened_at,
      -1                         AS sort_order
    FROM public.campaign_projects cp
    JOIN public.profiles pr ON pr.id = cp.owner_user_id
    LEFT JOIN public.business_profiles bp ON bp.user_id = cp.owner_user_id
    WHERE cp.counterparty_user_id = auth.uid()
      AND cp.status = 'completed'
  ),
  merged AS (
    SELECT * FROM manual
    UNION ALL
    SELECT * FROM platform_work
  )
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'source', source, 'verified', verified, 'is_visible', is_visible,
        'title', title, 'brand_name', brand_name, 'description', description,
        'platform', platform, 'content_url', content_url, 'thumbnail_url', thumbnail_url,
        'views', views, 'likes', likes, 'happened_at', happened_at
      )
      ORDER BY sort_order ASC, happened_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT * FROM merged ORDER BY sort_order ASC, happened_at DESC
    LIMIT greatest(coalesce(p_limit, 24), 0)
  ) t;
$$;

-- Authenticated only. No p_user_id to spoof — see the header note.
GRANT EXECUTE ON FUNCTION public.get_my_portfolio(INT) TO authenticated;
