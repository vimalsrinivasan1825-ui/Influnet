-- 116: Make "how many people clicked through from my profile" a real number.
--
-- profile_link_clicks has existed since migration 012 and has never held a
-- single row: nothing in web or mobile has ever called record_profile_link_click.
-- It is the same failure as public.connections (029) — a table built for a
-- feature that was never wired — except this one is about to be wired, which
-- means its integrity problems stop being theoretical.
--
-- Three of them, in the order they matter:
--
-- 1. ANYONE COULD WRITE ANYTHING. The 012 function is SECURITY DEFINER, granted
--    to anon, and takes the creator id as an argument. So any stranger with the
--    endpoint could run a creator's "reach" to a million, or — worse for a
--    marketplace — run a rival's to zero-credibility nonsense. Fixed the same
--    way 075 fixed profile_views: the function records the CALLER, and anon
--    loses execute entirely. Anonymous clicks (the common case: a brand
--    following a bio link while logged out) go through the server route, which
--    holds the service-role key and rate-limits per IP.
--
-- 2. A RELOAD LOOP WAS A THOUSAND CLICKS. There was no de-duplication at all.
--    The number a creator is shown says "people", so it must count people:
--    one row per (creator, link, viewer, day), same daily grain profile_views
--    settled on.
--
-- 3. ANONYMOUS VISITORS HAVE NO IDENTITY TO DEDUPE ON. viewer_key holds one:
--    the signed-in user's id when there is one, otherwise a salted hash of the
--    visitor's IP and the date, computed in the application (see
--    lib/profile-reach.ts). The hash is not reversible to an address, rotates
--    daily, and is never shown to anyone — it exists only so the unique index
--    has something to bite on. Storing the raw IP would be collecting personal
--    data to power a counter, which is not a trade worth making.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Columns the counter needs
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profile_link_clicks
  ADD COLUMN IF NOT EXISTS viewer_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS viewer_key     TEXT,
  ADD COLUMN IF NOT EXISTS clicked_on     DATE NOT NULL DEFAULT CURRENT_DATE;

-- Any pre-existing row (there are none in any environment, but this must be
-- safe if that assumption is wrong somewhere) gets a key unique to itself, so
-- the index below can be created without collapsing real history.
UPDATE public.profile_link_clicks
SET viewer_key = id::text
WHERE viewer_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profile_link_clicks_unique_daily
  ON public.profile_link_clicks (influencer_user_id, link_type, clicked_on, viewer_key);

CREATE INDEX IF NOT EXISTS profile_link_clicks_reach_idx
  ON public.profile_link_clicks (influencer_user_id, clicked_at DESC, link_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The write path, locked to the caller
-- ═══════════════════════════════════════════════════════════════════════════
--
-- link_type is NOT constrained by a CHECK. The platform registry grows (see
-- lib/social/), and a constraint nobody remembers to widen would start
-- rejecting writes for a newly supported network — losing analytics silently,
-- which is the failure mode this whole migration exists to end. The function
-- normalises instead: anything it does not recognise is recorded as 'other',
-- so the column's vocabulary stays closed without the write ever failing.

CREATE OR REPLACE FUNCTION public.normalise_link_type(p_link_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(trim(p_link_type), ''))
    WHEN 'instagram' THEN 'instagram'
    WHEN 'youtube'   THEN 'youtube'
    WHEN 'facebook'  THEN 'facebook'
    WHEN 'twitter'   THEN 'twitter'
    WHEN 'x'         THEN 'twitter'
    WHEN 'snapchat'  THEN 'snapchat'
    WHEN 'linkedin'  THEN 'linkedin'
    WHEN 'website'   THEN 'website'
    WHEN 'profile'   THEN 'profile'
    ELSE 'other'
  END;
$$;

CREATE OR REPLACE FUNCTION public.record_profile_link_click(
  p_influencer_user_id UUID,
  p_link_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- A creator clicking their own links is not reach.
  IF v_caller = p_influencer_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.profile_link_clicks (
    influencer_user_id, link_type, viewer_user_id, viewer_key
  )
  VALUES (
    p_influencer_user_id,
    public.normalise_link_type(p_link_type),
    v_caller,
    v_caller::text
  )
  ON CONFLICT (influencer_user_id, link_type, clicked_on, viewer_key) DO NOTHING;
END;
$$;

-- Closes the unauthenticated unlimited-write vector 012 opened. Anonymous
-- clicks are recorded by the server with the service-role key instead.
REVOKE EXECUTE ON FUNCTION public.record_profile_link_click(UUID, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.record_profile_link_click(UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reading it back
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The creator's own SELECT policy (012) already scopes reads correctly, so this
-- exists for one reason: aggregation. Home needs a per-platform breakdown for
-- two windows to show a trend, and shipping every click row to a phone to count
-- them there is the kind of thing that is fine with 40 rows and absurd with
-- 40,000. Derived on read, never stored — same argument as
-- get_collaboration_stats (113).
--
-- SECURITY INVOKER, deliberately: it must obey the caller's RLS, so it cannot
-- become a way to read somebody else's numbers by passing their id.

CREATE OR REPLACE FUNCTION public.get_profile_link_reach(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  link_type       TEXT,
  clicks          BIGINT,
  people          BIGINT,
  prior_people    BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH windows AS (
    SELECT
      now() - (p_days || ' days')::interval        AS current_start,
      now() - (p_days * 2 || ' days')::interval    AS prior_start
  )
  SELECT
    c.link_type,
    count(*) FILTER (WHERE c.clicked_at >= w.current_start)                    AS clicks,
    count(DISTINCT c.viewer_key) FILTER (WHERE c.clicked_at >= w.current_start) AS people,
    count(DISTINCT c.viewer_key) FILTER (
      WHERE c.clicked_at >= w.prior_start AND c.clicked_at < w.current_start
    )                                                                          AS prior_people
  FROM public.profile_link_clicks c
  CROSS JOIN windows w
  WHERE c.influencer_user_id = auth.uid()
    AND c.clicked_at >= w.prior_start
  GROUP BY c.link_type
  HAVING count(*) FILTER (WHERE c.clicked_at >= w.current_start) > 0
  ORDER BY clicks DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_link_reach(INTEGER) TO authenticated;
