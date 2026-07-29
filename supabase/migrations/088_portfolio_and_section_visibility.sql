-- Migration 088: let a creator choose what their public profile shows.
--
-- Two independent controls, both opt-OUT (default = shown, so nothing changes
-- for an existing profile until the creator touches a toggle):
--
--   1. Section visibility — three switches on influencer_profiles:
--      'instagram_posts' (the scraped recent-posts grid), 'youtube_videos'
--      (the scraped video list), 'portfolio' (the curated wall from 087).
--      Stored as one JSONB blob rather than three columns: a missing key
--      means "on", so the type can grow a fourth section later without a
--      migration, and an unset object ('{}') is indistinguishable from
--      every section being explicitly on.
--
--   2. Per-item visibility — creator_portfolio_items.is_visible. A creator can
--      hide one embarrassing old post without pulling the whole section.
--      Manual entries only in this round: a completed platform project has no
--      row of its own to carry the flag (087's design — it is derived live
--      from campaign_projects, deliberately not stored), and adding one means
--      touching that table's write path, which migration 081 hardened
--      specifically to resist exactly this kind of casual extra column. Doing
--      that safely is a separate piece of work, not a subtask of this one.
--
-- ── THE OWNER-VS-PUBLIC SPLIT ──────────────────────────────────────────
--
-- get_creator_portfolio (087) is granted to anon and stays that way: it is the
-- PUBLIC read, so it now filters manual rows to is_visible = true.
--
-- The creator managing their own portfolio needs the opposite — see hidden
-- items too, so there is something to turn back on. That cannot be the same
-- function with an "include hidden" flag: it is SECURITY DEFINER and granted
-- to anon, and a flag on a caller-supplied p_user_id would let anyone read
-- anyone else's hidden work by passing true. get_my_portfolio() is the
-- separate function for this: no p_user_id parameter at all, it reads
-- auth.uid() directly, and it is granted to authenticated only. There is no
-- argument for it to lie about whose portfolio it returns.

ALTER TABLE public.creator_portfolio_items
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.influencer_profiles
  ADD COLUMN IF NOT EXISTS profile_section_visibility JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Migration 083 revoked column-blanket UPDATE and column-allowlisted what
-- remains (a self-service field is writable, is_verified etc. are not). A new
-- column is invisible to that allowlist until explicitly added — without this
-- grant, PATCHing profile_section_visibility passes RLS and fails silently on
-- privileges, which is a confusing way to discover the omission.
GRANT UPDATE (profile_section_visibility) ON public.influencer_profiles TO authenticated;

-- ── Public read: unchanged signature, now visibility-aware ─────────────
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
      cp.updated_at              AS happened_at,
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
      cp.updated_at              AS happened_at,
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

-- ── Public read of the section toggles ──────────────────────────────────
-- influencer_profiles has no public SELECT policy (PII lockdown), so the
-- public page needs a definer function for this the same way it already does
-- for reviews (080) and collaborations (067).
CREATE OR REPLACE FUNCTION public.get_profile_visibility(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(profile_section_visibility, '{}'::jsonb)
  FROM public.influencer_profiles
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_visibility(UUID) TO anon, authenticated;
