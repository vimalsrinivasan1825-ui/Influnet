-- 102: let creator search match on Instagram handle too, not just username.
--
-- search_influencers() (048) only ever matched p.name / ip.username /
-- ip.headline / ip.bio. A business owner searching by the creator's Instagram
-- handle (which is what they usually have on hand, often pasted straight from
-- an instagram.com/... URL) got nothing back even though ip.instagram_handle
-- was sitting right there. /api/discover then narrows further to a
-- username-only substring match (deliberately, to keep this a lookup rather
-- than a browse tool) — that route-level filter is updated separately to
-- also allow instagram_handle.

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

CREATE INDEX IF NOT EXISTS influencer_profiles_instagram_handle_trgm_idx
  ON public.influencer_profiles USING gin (instagram_handle gin_trgm_ops);
