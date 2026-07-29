-- Migration 087: creator portfolio — past work with proof.
--
-- WHAT THIS REPLACES
--
-- Two half-features have stood in for a portfolio since the beginning:
--
--   * `influencer_profiles.portfolio` (migration 012) — a JSONB array of
--     {url, title}. It is read by the public-profile RPCs and rendered by
--     NOTHING, and no settings screen has ever written to it. A dead column.
--   * `influencer_profiles.past_collaborations` (migration 021) — a flat array
--     of brand-name strings, typed into a textarea, rendered as bare chips.
--     No link, no date, no deliverable, no proof.
--
-- A creator arriving from Instagram has years of real work and no way to show
-- any of it. This table is where that work lives: one row per piece, with the
-- link to the actual post and a cached thumbnail so the profile renders as a
-- grid of real content rather than a word cloud of brand names.
--
-- THE TRUST RULE (the important part)
--
-- Entries come from two places and MUST NOT look alike:
--
--   source='platform' — a completed campaign_project on Influnet. The brand,
--                       the date and the fact it happened are all verifiable
--                       from our own tables. Not stored here at all: the RPC
--                       below derives it live, so it can never drift from the
--                       project record or outlive a cancellation.
--   source='manual'   — the creator typed it in. We verified nothing except
--                       that the URL's host is a real social platform.
--
-- `verified` is therefore NOT a column a creator can write — it is computed by
-- the RPC from the source. Letting a creator mark their own entry verified is
-- the same failure class as the self-awarded badge closed in migration 083.

CREATE TABLE IF NOT EXISTS public.creator_portfolio_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the work was.
  title         TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  brand_name    TEXT CHECK (brand_name IS NULL OR char_length(trim(brand_name)) <= 80),
  description   TEXT CHECK (description IS NULL OR char_length(description) <= 500),

  -- Where it lives. `platform` is the social network, not our internal roles.
  platform      TEXT NOT NULL CHECK (platform IN ('instagram', 'youtube', 'other')),
  content_url   TEXT NOT NULL CHECK (char_length(content_url) BETWEEN 8 AND 2048),

  -- Cached at write time from the link's oEmbed/OpenGraph data. Cached rather
  -- than fetched on render: a profile page must not make N third-party requests,
  -- and Instagram CDN URLs expire — a stale thumbnail degrades to a placeholder
  -- tile, where a live fetch would degrade to a slow, half-broken page.
  thumbnail_url TEXT,

  -- Self-reported performance. Nullable and clearly labelled in the UI: these
  -- are the creator's own numbers, not scraped, and never presented as ours.
  views         BIGINT CHECK (views IS NULL OR views >= 0),
  likes         BIGINT CHECK (likes IS NULL OR likes >= 0),

  -- When the work went out (not when the row was created).
  published_at  DATE,

  -- Creator-controlled ordering on the profile grid. Lower sorts first.
  sort_order    INT NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_portfolio_items_user_idx
  ON public.creator_portfolio_items (user_id, sort_order, created_at DESC);

-- One row per URL per creator: re-adding the same post is always a mistake.
--
-- Indexed on a HASH of the URL rather than the URL itself. A btree entry cannot
-- exceed roughly a third of an 8KB page, and content_url allows 2048 characters
-- — which is comfortably under the limit in ASCII but can exceed it once
-- multi-byte characters are involved, turning a long link into a runtime
-- "index row size exceeds maximum" on INSERT. md5 is fixed-width, so the index
-- is the same size no matter what gets pasted. (Deduplication only, not
-- security — collision resistance is irrelevant here.)
CREATE UNIQUE INDEX IF NOT EXISTS creator_portfolio_items_user_url_idx
  ON public.creator_portfolio_items (user_id, md5(content_url));

-- A portfolio is a wall, not a feed. The cap keeps the public page fast and
-- stops the table being used as free media storage.
CREATE OR REPLACE FUNCTION public.enforce_portfolio_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.creator_portfolio_items WHERE user_id = NEW.user_id) >= 24 THEN
    RAISE EXCEPTION 'Portfolio is full (24 items). Remove one before adding another.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_limit ON public.creator_portfolio_items;
CREATE TRIGGER trg_portfolio_limit
  BEFORE INSERT ON public.creator_portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portfolio_limit();

CREATE OR REPLACE FUNCTION public.touch_portfolio_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_portfolio_touch ON public.creator_portfolio_items;
CREATE TRIGGER trg_portfolio_touch
  BEFORE UPDATE ON public.creator_portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_portfolio_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────
-- Owner writes; nobody else writes. Public reads go through the SECURITY
-- DEFINER RPC below rather than a permissive SELECT policy, so the read path
-- is one auditable function instead of a table open to anon.

ALTER TABLE public.creator_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_owner_select ON public.creator_portfolio_items;
CREATE POLICY portfolio_owner_select ON public.creator_portfolio_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS portfolio_owner_insert ON public.creator_portfolio_items;
CREATE POLICY portfolio_owner_insert ON public.creator_portfolio_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITH CHECK as well as USING: without it, an owner could UPDATE a row and set
-- user_id to somebody else, planting an entry on another creator's profile.
DROP POLICY IF EXISTS portfolio_owner_update ON public.creator_portfolio_items;
CREATE POLICY portfolio_owner_update ON public.creator_portfolio_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS portfolio_owner_delete ON public.creator_portfolio_items;
CREATE POLICY portfolio_owner_delete ON public.creator_portfolio_items
  FOR DELETE USING (auth.uid() = user_id);

-- ── The public read ────────────────────────────────────────────────────
-- Manual entries UNION completed platform projects, newest first.
--
-- Platform entries are derived live rather than copied in on completion:
--   * a cancelled or reopened project stops advertising itself immediately;
--   * the brand name always matches the project record;
--   * there is no sync job to drift out of date.

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
  ),
  -- Not named `platform`: that is also a column name in both branches, and a
  -- CTE shadowing a column makes the UNION below hard to read even though
  -- Postgres resolves it correctly.
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
      -1                         AS sort_order  -- verified work leads the grid
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
        'id', id,
        'source', source,
        'verified', verified,
        'title', title,
        'brand_name', brand_name,
        'description', description,
        'platform', platform,
        'content_url', content_url,
        'thumbnail_url', thumbnail_url,
        'views', views,
        'likes', likes,
        'happened_at', happened_at
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

COMMENT ON TABLE public.creator_portfolio_items IS
  'Creator-added past work. source=manual only; platform-completed projects are derived live by get_creator_portfolio() and never stored here.';
