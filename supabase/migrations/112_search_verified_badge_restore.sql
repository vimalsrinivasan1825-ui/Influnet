-- 112: put verified_badge back into search results.
--
-- Migration 084 added `verified_badge` to search_influencers' returned jsonb so
-- the tick could render next to a creator in search. Migration 102 rewrote the
-- whole function to add Instagram-handle matching and rebuilt the
-- jsonb_build_object from the 048 version — silently dropping the field 084 had
-- added. CREATE OR REPLACE means the newer definition simply won.
--
-- Nothing errored: the clients ask for `verified_badge`, get undefined, and
-- render no badge. So every creator has looked unverified in search since 102,
-- including the ones who completed the ownership handshake.
--
-- This is 102's definition verbatim with that one key restored. No signature
-- change, no behaviour change, nothing else touched.

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
      -- Restored (see header). coalesce because the column is nullable and the
      -- clients expect a boolean, not null.
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
        OR ip.instagram_handle ILIKE '%' || v_q || '%')
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
