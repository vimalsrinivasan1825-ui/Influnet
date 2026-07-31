-- Migration 080: get_public_reviews — surface the ratings that already exist.
--
-- Migration 051 added `reviews` (one per participant per completed project) and
-- said in its own comment that "ratings surface on public profiles". They never
-- did: the only reader is /api/projects/[id]/reviews, which is scoped to a
-- single project and requires auth. So a creator finishes five projects, earns
-- five 5-star reviews, and no brand looking at their profile can see any of it.
--
-- This RPC is the missing reader. It returns the aggregate (average + count)
-- plus the most recent reviews with the reviewer's public name, for rendering on
-- /c/[username].
--
-- Design notes:
--  * SECURITY DEFINER so an anonymous visitor can read it. `reviews` is already
--    RLS-public (051), but `profiles` is not readable column-wise by anon, so the
--    join has to happen inside a definer function.
--  * Only reviews attached to a COMPLETED project count. A review row can only
--    be written for a completed project (051's insert policy), but statuses can
--    change later (cancellation), and a rating for work that was undone should
--    not keep advertising.
--  * Comments are trimmed to 400 chars — a public profile card, not an essay.
--  * Generic over user id, so the same function serves a business profile if
--    brand ratings are surfaced later. Nothing here is creator-specific.
--  * The project TITLE is deliberately not returned. The reviewer knowingly
--    writes a public rating, but nobody agreed to publish the name of the
--    campaign it came from — titles routinely carry unreleased product or
--    launch names. The reviewer's name, their star rating and their own words
--    are the whole public payload.

CREATE OR REPLACE FUNCTION public.get_public_reviews(p_user_id UUID, p_limit INT DEFAULT 6)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      r.id,
      r.rating,
      left(nullif(trim(r.comment), ''), 400) AS comment,
      r.created_at,
      coalesce(nullif(trim(bp.company_name), ''), pr.name) AS reviewer_name,
      pr.role AS reviewer_role
    FROM public.reviews r
    JOIN public.campaign_projects cp ON cp.id = r.project_id
    JOIN public.profiles pr ON pr.id = r.from_user_id
    LEFT JOIN public.business_profiles bp ON bp.user_id = pr.id
    WHERE r.to_user_id = p_user_id
      AND cp.status = 'completed'
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM scoped),
    -- One decimal, matching how the UI prints it (4.8, not 4.833333).
    'average', (SELECT round(avg(rating)::numeric, 1) FROM scoped),
    'items', coalesce((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', id,
          'rating', rating,
          'comment', comment,
          'created_at', created_at,
          'reviewer_name', reviewer_name,
          'reviewer_role', reviewer_role
        ) AS x
        FROM scoped
        ORDER BY created_at DESC
        LIMIT greatest(coalesce(p_limit, 6), 0)
      ) t
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_public_reviews(UUID, INT) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_reviews(UUID, INT) IS
  'Public rating summary + recent reviews for a user, restricted to completed projects.';
