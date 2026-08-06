-- Migration 110: admin_get_user_activity must stay callable with zero args.
--
-- The system health page (api/admin/health) proves an RPC is installed by
-- calling it with `{}` and checking the response isn't PostgREST's "no
-- matching function signature" error. Every other probed RPC already has
-- all-optional params for exactly this reason; admin_get_user_activity (108)
-- was the first to require one, so a zero-arg health probe against it got a
-- false "not applied" — not because it's missing, but because {} doesn't
-- match its signature. Giving p_user_id a default restores that convention;
-- the function already raises its own exception for a null id, so a caller
-- who omits it still gets a clear error, just from inside the function
-- instead of from PostgREST's schema cache.

CREATE OR REPLACE FUNCTION public.admin_get_user_activity(
  p_user_id UUID DEFAULT NULL,
  p_limit   INT DEFAULT 100,
  p_offset  INT DEFAULT 0
)
RETURNS TABLE (
  at          TIMESTAMPTZ,
  kind        TEXT,
  title       TEXT,
  detail      TEXT,
  link        TEXT,
  project_id  BIGINT,
  actor_is_me BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_me UUID := p_user_id;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  RETURN QUERY
  WITH events AS (
    -- ── Account ───────────────────────────────────────────────────────────
    SELECT p.created_at AS at,
           'account_created'::text AS kind,
           'Joined Influnet'::text AS title,
           ('Signed up as a ' || CASE WHEN p.role::text = 'business_owner' THEN 'brand' ELSE 'creator' END)::text AS detail,
           '/dashboard/admin/users/' || v_me::text AS link,
           NULL::bigint AS project_id,
           true AS actor_is_me
    FROM public.profiles p WHERE p.id = v_me

    UNION ALL
    SELECT p.verified_at, 'verified', 'Account verified',
           'Profile was verified', '/dashboard/admin/users/' || v_me::text, NULL::bigint, false
    FROM public.profiles p WHERE p.id = v_me AND p.verified_at IS NOT NULL

    -- ── Collaboration requests ────────────────────────────────────────────
    UNION ALL
    SELECT cr.created_at,
           CASE WHEN cr.from_user_id = v_me THEN 'request_sent' ELSE 'request_received' END,
           CASE WHEN cr.from_user_id = v_me
                THEN 'Sent a collaboration request to ' || coalesce(other.name, 'a partner')
                ELSE 'Received a collaboration request from ' || coalesce(other.name, 'a partner') END,
           coalesce(nullif(split_part(cr.message, E'\n', 1), ''), 'Collaboration request'),
           '/dashboard/admin/collabs',
           NULL::bigint,
           cr.from_user_id = v_me
    FROM public.collab_requests cr
    JOIN public.profiles other
      ON other.id = CASE WHEN cr.from_user_id = v_me THEN cr.to_user_id ELSE cr.from_user_id END
    WHERE cr.from_user_id = v_me OR cr.to_user_id = v_me

    UNION ALL
    SELECT cr.updated_at,
           'request_' || cr.status::text,
           CASE cr.status::text
             WHEN 'accepted'  THEN 'Collaboration request accepted'
             WHEN 'declined'  THEN 'Collaboration request declined'
             WHEN 'cancelled' THEN 'Collaboration request cancelled'
             ELSE 'Collaboration request updated' END,
           'With ' || coalesce(other.name, 'a partner'),
           '/dashboard/admin/collabs',
           NULL::bigint,
           CASE WHEN cr.status::text = 'cancelled' THEN cr.from_user_id = v_me
                ELSE cr.to_user_id = v_me END
    FROM public.collab_requests cr
    JOIN public.profiles other
      ON other.id = CASE WHEN cr.from_user_id = v_me THEN cr.to_user_id ELSE cr.from_user_id END
    WHERE (cr.from_user_id = v_me OR cr.to_user_id = v_me)
      AND cr.status::text <> 'pending'

    -- ── Proposed terms ────────────────────────────────────────────────────
    UNION ALL
    SELECT pp.created_at,
           'terms_proposed',
           CASE WHEN pp.proposed_by = v_me THEN 'Proposed project terms' ELSE 'Received project terms' END,
           pp.title || CASE WHEN pp.budget IS NOT NULL
                            THEN ' · ₹' || trim(to_char(pp.budget, 'FM999,999,999')) ELSE '' END,
           '/dashboard/admin/collabs',
           pp.project_id,
           pp.proposed_by = v_me
    FROM public.project_proposals pp
    JOIN public.collab_requests cr ON cr.id = pp.collab_request_id
    WHERE cr.from_user_id = v_me OR cr.to_user_id = v_me

    UNION ALL
    SELECT pp.resolved_at,
           'terms_' || pp.status,
           CASE pp.status
             WHEN 'accepted'  THEN 'Accepted the terms — project started'
             WHEN 'declined'  THEN 'Terms declined'
             WHEN 'withdrawn' THEN 'Terms withdrawn'
             ELSE 'Terms updated' END,
           pp.title || coalesce(' · ' || pp.review_note, ''),
           CASE WHEN pp.project_id IS NOT NULL
                THEN '/dashboard/admin/projects/' || pp.project_id::text
                ELSE '/dashboard/admin/collabs' END,
           pp.project_id,
           pp.resolved_by = v_me
    FROM public.project_proposals pp
    JOIN public.collab_requests cr ON cr.id = pp.collab_request_id
    WHERE (cr.from_user_id = v_me OR cr.to_user_id = v_me)
      AND pp.status <> 'pending' AND pp.resolved_at IS NOT NULL

    -- ── Projects ──────────────────────────────────────────────────────────
    UNION ALL
    SELECT cp.created_at, 'project_started', 'Project started', cp.title,
           '/dashboard/admin/projects/' || cp.id::text, cp.id,
           cp.created_by_user_id = v_me
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status <> 'pending_acceptance'

    UNION ALL
    SELECT cp.updated_at, 'project_completed', 'Project completed', cp.title,
           '/dashboard/admin/projects/' || cp.id::text, cp.id, true
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'completed'

    UNION ALL
    SELECT cp.cancelled_at, 'project_cancelled', 'Project cancelled',
           cp.title || coalesce(' · ' || cp.cancellation_reason, ''),
           '/dashboard/admin/projects/' || cp.id::text, cp.id,
           cp.cancelled_by = v_me
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'cancelled' AND cp.cancelled_at IS NOT NULL

    -- ── Stage-by-stage work ───────────────────────────────────────────────
    UNION ALL
    SELECT pa.created_at, pa.type, pa.summary, cp.title,
           '/dashboard/admin/projects/' || cp.id::text, cp.id,
           pa.actor_user_id = v_me
    FROM public.project_activity pa
    JOIN public.campaign_projects cp ON cp.id = pa.project_id
    WHERE cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me

    -- ── Payments ──────────────────────────────────────────────────────────
    UNION ALL
    SELECT pay.created_at, 'payment_' || pay.status,
           CASE WHEN pay.status = 'paid' THEN 'Payment of ₹' || trim(to_char(pay.amount, 'FM999,999,999')) || ' settled'
                ELSE 'Payment of ₹' || trim(to_char(pay.amount, 'FM999,999,999')) || ' ' || pay.status END,
           cp.title,
           '/dashboard/admin/projects/' || cp.id::text, cp.id,
           pay.payer_id = v_me
    FROM public.project_payments pay
    JOIN public.campaign_projects cp ON cp.id = pay.project_id
    WHERE cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me
  )
  SELECT e.at, e.kind, e.title, e.detail, e.link, e.project_id, coalesce(e.actor_is_me, false)
  FROM events e
  WHERE e.at IS NOT NULL
  ORDER BY e.at DESC
  LIMIT greatest(1, least(p_limit, 200))
  OFFSET greatest(0, p_offset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_activity(UUID, INT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_activity(UUID, INT, INT) FROM anon;
