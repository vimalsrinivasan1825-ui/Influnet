-- Migration 130: Extend collaboration stats with requests_sent
--
-- Adds requests_sent to get_collaboration_stats so the networking funnel
-- screen can show both directions.
--
-- Can't CREATE OR REPLACE with a different return type — must DROP first.

DROP FUNCTION IF EXISTS public.get_collaboration_stats(UUID);

CREATE FUNCTION public.get_collaboration_stats(p_user_id UUID)
RETURNS TABLE (
  partners_total      INT,
  projects_total      INT,
  projects_active     INT,
  projects_completed  INT,
  projects_cancelled  INT,
  requests_accepted   INT,
  requests_sent       INT,
  first_collab_at     TIMESTAMPTZ,
  last_collab_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH mine AS (
    SELECT
      CASE WHEN cp.owner_user_id = p_user_id
           THEN cp.counterparty_user_id ELSE cp.owner_user_id END AS partner_id,
      cp.status,
      cp.created_at
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id)
      AND cp.status <> 'pending_acceptance'
  ),
  reqs AS (
    SELECT count(*)::INT AS n
    FROM public.collab_requests cr
    WHERE (cr.from_user_id = p_user_id OR cr.to_user_id = p_user_id)
      AND cr.status = 'accepted'
  ),
  sent AS (
    SELECT count(*)::INT AS n
    FROM public.collab_requests cr
    WHERE cr.from_user_id = p_user_id
  )
  SELECT
    (SELECT count(DISTINCT partner_id) FROM mine)::INT,
    (SELECT count(*) FROM mine)::INT,
    (SELECT count(*) FROM mine WHERE status = 'active')::INT,
    (SELECT count(*) FROM mine WHERE status = 'completed')::INT,
    (SELECT count(*) FROM mine WHERE status = 'cancelled')::INT,
    (SELECT n FROM reqs),
    (SELECT n FROM sent),
    (SELECT min(created_at) FROM mine),
    (SELECT max(created_at) FROM mine);
$$;

GRANT EXECUTE ON FUNCTION public.get_collaboration_stats(UUID) TO anon, authenticated;
