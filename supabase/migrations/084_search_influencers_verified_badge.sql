-- Migration 084: expose verified_badge from search_influencers()
--
-- WHY THIS EXISTS
--
-- /api/discover?id=<uuid> is the ONLY way a business sees a creator's details
-- before sending a paid collaboration request — Discover browsing is disabled
-- (see route comment: "temporarily disabled for V1 launch per client request"),
-- and the mobile app has no separate creator-fetch path either
-- (apps/mobile/app/creator/[id].tsx calls this same endpoint). Both surfaces
-- want to show whether the creator has proven ownership of their handle
-- (profiles.verified_badge, the real pipeline output locked down in 083) before
-- a brand commits money — but search_influencers() never selected the column.
--
-- search_influencers() is SECURITY DEFINER, so it reads profiles.verified_badge
-- fine on its own. But apps/web/src/app/api/conversations/[id]/deal/route.ts
-- (the deal-card endpoint behind the same trust-signal UI) selects the OTHER
-- party's profile directly through the authenticated client:
--   supabase.from('profiles').select('id, name, role, verified_badge')...
-- 048 column-grants SELECT on public.profiles to authenticated for exactly
-- (id, role, name, location, created_at, updated_at) — verified_badge is not
-- in that list. Per 078's documented failure mode, selecting a column outside
-- the granted set does not just omit that column: it fails the WHOLE query at
-- the database level, silently, with the route never checking the error. That
-- would have broken the deal card for every user, not just hidden a badge.
-- verified_badge is not sensitive — get_public_influencer (083) already
-- exposes it to anyone, logged in or not — so it's safe to add here.

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

GRANT SELECT (verified_badge) ON public.profiles TO authenticated;
