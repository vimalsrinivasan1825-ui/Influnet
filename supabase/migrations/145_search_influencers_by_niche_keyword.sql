-- 145: let the creator search's free-text query match a creator's NICHE.
--
-- `p_q` matched name, username, headline, bio and instagram_handle. It did not
-- match `niche`, which is the one field that actually answers "find me a food
-- creator" — niche was reachable only through `p_niche`, an exact JSONB key
-- containment that requires the caller to already know the tag vocabulary
-- ("Food & Cooking", not "food").
--
-- So typing "food" found only creators who happened to have written the word in
-- their bio, and missed every creator who had correctly tagged themselves. That
-- is backwards.
--
-- `p_niche` is unchanged: it is still the exact-tag filter the Pro browse gate
-- in /api/discover sits on top of. This only widens the typed query.
--
-- ── WHY jsonb_array_elements_text AND NOT niche::text ILIKE ──────────────
--
-- `ip.niche::text` would be the one-liner, but it matches the JSON punctuation
-- too: a query of `", "` or `[` would match every creator with two or more
-- niches. Unnesting compares against the tag values and nothing else.
--
-- This is 112's definition with that one clause added. No signature change.

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
      'verified_badge', coalesce(p.verified_badge, false),
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
        OR ip.bio ILIKE '%' || v_q || '%'
        OR ip.instagram_handle ILIKE '%' || v_q || '%'
        -- New: the typed query matches a niche tag too.
        OR EXISTS (
             SELECT 1
             FROM jsonb_array_elements_text(coalesce(ip.niche, '[]'::jsonb)) AS n(tag)
             WHERE n.tag ILIKE '%' || v_q || '%'
           ))
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
