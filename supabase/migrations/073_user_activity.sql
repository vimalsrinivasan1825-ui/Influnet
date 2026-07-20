-- Migration 073: "My activity" — one timeline per user, across everything.
--
-- Derived, not logged. A new events table would only capture what happens from
-- today onward, and the whole point is to show a person's history from the day
-- they signed up. Everything needed is already recorded across the tables
-- below, so this reads them rather than duplicating writes into a second log
-- that could drift out of sync with the rows it describes.
--
-- Every row carries a `link` so the UI can jump straight to the thing it
-- describes — a stage event opens the project at its current stage.

CREATE OR REPLACE FUNCTION public.get_user_activity(
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0
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
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role::text INTO v_role FROM public.profiles WHERE id = v_me;

  RETURN QUERY
  WITH events AS (
    -- ── Account ───────────────────────────────────────────────────────────
    SELECT p.created_at AS at,
           'account_created'::text AS kind,
           'Joined Influnet'::text AS title,
           ('Signed up as a ' || CASE WHEN p.role::text = 'business_owner' THEN 'brand' ELSE 'creator' END)::text AS detail,
           '/dashboard/settings'::text AS link,
           NULL::bigint AS project_id,
           true AS actor_is_me
    FROM public.profiles p WHERE p.id = v_me

    UNION ALL
    SELECT p.verified_at, 'verified', 'Account verified',
           'Your profile was verified', '/dashboard/settings', NULL::bigint, false
    FROM public.profiles p WHERE p.id = v_me AND p.verified_at IS NOT NULL

    -- ── Collaboration requests ────────────────────────────────────────────
    UNION ALL
    SELECT cr.created_at,
           CASE WHEN cr.from_user_id = v_me THEN 'request_sent' ELSE 'request_received' END,
           CASE WHEN cr.from_user_id = v_me
                THEN 'Sent a collaboration request to ' || coalesce(other.name, 'a partner')
                ELSE 'Received a collaboration request from ' || coalesce(other.name, 'a partner') END,
           coalesce(nullif(split_part(cr.message, E'\n', 1), ''), 'Collaboration request'),
           '/dashboard/requests',
           NULL::bigint,
           cr.from_user_id = v_me
    FROM public.collab_requests cr
    JOIN public.profiles other
      ON other.id = CASE WHEN cr.from_user_id = v_me THEN cr.to_user_id ELSE cr.from_user_id END
    WHERE cr.from_user_id = v_me OR cr.to_user_id = v_me

    -- Resolution of a request. collab_requests keeps no decided_at, so
    -- updated_at is the best available timestamp; rows still pending are
    -- excluded so nothing is reported as decided before it was.
    UNION ALL
    SELECT cr.updated_at,
           'request_' || cr.status::text,
           CASE cr.status::text
             WHEN 'accepted'  THEN 'Collaboration request accepted'
             WHEN 'declined'  THEN 'Collaboration request declined'
             WHEN 'cancelled' THEN 'Collaboration request cancelled'
             ELSE 'Collaboration request updated' END,
           'With ' || coalesce(other.name, 'a partner'),
           '/dashboard/requests',
           NULL::bigint,
           -- The receiver accepts or declines; the sender cancels.
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
           coalesce('/dashboard/messages?conv=' || pp.conversation_id::text, '/dashboard/messages'),
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
                THEN '/dashboard/projects/' || pp.project_id::text
                ELSE coalesce('/dashboard/messages?conv=' || pp.conversation_id::text, '/dashboard/messages') END,
           pp.project_id,
           pp.resolved_by = v_me
    FROM public.project_proposals pp
    JOIN public.collab_requests cr ON cr.id = pp.collab_request_id
    WHERE (cr.from_user_id = v_me OR cr.to_user_id = v_me)
      AND pp.status <> 'pending' AND pp.resolved_at IS NOT NULL

    -- ── Projects ──────────────────────────────────────────────────────────
    UNION ALL
    SELECT cp.created_at, 'project_started', 'Project started', cp.title,
           '/dashboard/projects/' || cp.id::text, cp.id,
           cp.created_by_user_id = v_me
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status <> 'pending_acceptance'

    UNION ALL
    SELECT cp.updated_at, 'project_completed', 'Project completed', cp.title,
           '/dashboard/projects/' || cp.id::text, cp.id, true
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'completed'

    UNION ALL
    SELECT cp.cancelled_at, 'project_cancelled', 'Project cancelled',
           cp.title || coalesce(' · ' || cp.cancellation_reason, ''),
           '/dashboard/projects/' || cp.id::text, cp.id,
           cp.cancelled_by = v_me
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'cancelled' AND cp.cancelled_at IS NOT NULL

    -- ── Stage-by-stage work ───────────────────────────────────────────────
    UNION ALL
    SELECT pa.created_at, pa.type, pa.summary, cp.title,
           '/dashboard/projects/' || cp.id::text, cp.id,
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
           '/dashboard/projects/' || cp.id::text, cp.id,
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

GRANT EXECUTE ON FUNCTION public.get_user_activity(INT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_activity(INT, INT) FROM anon;
