-- 099: Platform-wide activity feed for admins.
--
-- The question this answers: "who signed up, and what is happening right now?"
--
-- `get_user_activity` (073) is per-user and self-scoped — it is what a creator
-- sees on their own timeline. There has never been a way to watch the platform
-- as a whole, so during a tester round the only way to know whether anything
-- was happening was to open the Supabase table editor.
--
-- Same design as 073 and for the same reason: **derived from the rows that
-- already record these facts**, not from a new event-log table. That means it
-- covers everything that has ever happened rather than only what occurred
-- after this migration ran, and there is no writer to keep in sync — a feature
-- that forgets to emit an event cannot make this feed lie.

CREATE OR REPLACE FUNCTION public.get_platform_activity(
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0,
  p_hours  INT DEFAULT 168      -- default: the last 7 days
)
RETURNS TABLE (
  at         TIMESTAMPTZ,
  kind       TEXT,
  severity   TEXT,              -- 'info' | 'good' | 'warn' | 'bad'
  title      TEXT,
  detail     TEXT,
  actor_id   UUID,
  actor_name TEXT,
  actor_role TEXT,
  link       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  -- Bounded so a mistyped query cannot ask for a full-table scan of every
  -- join below. 90 days is far more history than a live feed ever needs.
  v_hours  INT := least(greatest(coalesce(p_hours, 168), 1), 2160);
  v_limit  INT := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_since  TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(hours => v_hours);

  RETURN QUERY
  WITH events AS (
    -- ── Signups ───────────────────────────────────────────────────────────
    SELECT p.created_at AS at,
           'signup'::text AS kind,
           'info'::text AS severity,
           'New signup'::text AS title,
           (CASE WHEN p.role::text = 'business_owner' THEN 'Business account'
                 WHEN p.role::text = 'admin' THEN 'Admin account'
                 ELSE 'Creator account' END)::text AS detail,
           p.id AS actor_id,
           p.name AS actor_name,
           p.role::text AS actor_role,
           ('/dashboard/admin/users')::text AS link
    FROM public.profiles p
    WHERE p.created_at >= v_since

    -- ── Ownership proof (the step creators most often stall on) ───────────
    UNION ALL
    SELECT c.verified_at,
           'ownership_verified'::text,
           'good'::text,
           'Proved account ownership'::text,
           (c.platform || ' · @' || c.handle)::text,
           c.user_id,
           p.name,
           p.role::text,
           '/dashboard/admin/approvals'::text
    FROM public.social_account_claims c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE c.status = 'verified' AND c.verified_at >= v_since

    -- A claim that expired is a creator who tried and gave up — the single
    -- most useful "something is wrong with onboarding" signal we have.
    UNION ALL
    SELECT c.expires_at,
           'ownership_expired'::text,
           'warn'::text,
           'Ownership code expired unused'::text,
           (c.platform || ' · @' || c.handle || ' · ' || c.attempts || ' attempt(s)')::text,
           c.user_id,
           p.name,
           p.role::text,
           '/dashboard/admin/approvals'::text
    FROM public.social_account_claims c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE c.status = 'pending'
      AND c.expires_at < now()
      AND c.expires_at >= v_since

    -- ── Verification badge ────────────────────────────────────────────────
    UNION ALL
    SELECT p.verified_at,
           'verified'::text,
           'good'::text,
           'Verified badge granted'::text,
           NULL::text,
           p.id,
           p.name,
           p.role::text,
           '/dashboard/admin/approvals'::text
    FROM public.profiles p
    WHERE p.verification_status = 'verified' AND p.verified_at >= v_since

    -- ── Marketplace ───────────────────────────────────────────────────────
    UNION ALL
    SELECT cr.created_at,
           'collab_request'::text,
           'info'::text,
           'Collaboration request sent'::text,
           ('to ' || coalesce(target.name, 'someone'))::text,
           cr.from_user_id,
           sender.name,
           sender.role::text,
           '/dashboard/admin/collabs'::text
    FROM public.collab_requests cr
    JOIN public.profiles sender ON sender.id = cr.from_user_id
    LEFT JOIN public.profiles target ON target.id = cr.to_user_id
    WHERE cr.created_at >= v_since

    -- ── Projects ──────────────────────────────────────────────────────────
    UNION ALL
    SELECT cp.created_at,
           'project_created'::text,
           'good'::text,
           'Project started'::text,
           cp.title::text,
           cp.owner_user_id,
           owner.name,
           owner.role::text,
           '/dashboard/admin/projects'::text
    FROM public.campaign_projects cp
    JOIN public.profiles owner ON owner.id = cp.owner_user_id
    WHERE cp.created_at >= v_since

    -- Stage movement is the heartbeat of a live test: it shows people getting
    -- through the flow rather than merely arriving.
    UNION ALL
    SELECT sa.created_at,
           ('project_' || sa.type)::text,
           'info'::text,
           -- `summary` is written name-free on purpose (the UI prefixes the
           -- actor), which is exactly the shape this feed wants.
           sa.summary::text,
           coalesce(cp.title, 'Project')::text,
           sa.actor_user_id,
           actor.name,
           actor.role::text,
           '/dashboard/admin/projects'::text
    FROM public.project_activity sa
    LEFT JOIN public.campaign_projects cp ON cp.id = sa.project_id
    LEFT JOIN public.profiles actor ON actor.id = sa.actor_user_id
    WHERE sa.created_at >= v_since

    -- ── Money ─────────────────────────────────────────────────────────────
    UNION ALL
    SELECT coalesce(pay.paid_at, pay.created_at),
           ('payment_' || pay.status)::text,
           (CASE WHEN pay.status = 'paid' THEN 'good'
                 WHEN pay.status = 'failed' THEN 'bad'
                 WHEN pay.status = 'refunded' THEN 'warn'
                 ELSE 'info' END)::text,
           ('Payment ' || pay.status)::text,
           -- amount is stored in PAISE (integer). Divide before showing it, or
           -- a ₹500 payment reads as ₹50,000 in the feed.
           ('₹' || round(pay.amount / 100.0, 2)::text
              || ' · ' || pay.stage_key
              || ' · ' || coalesce(cp.title, 'project'))::text,
           pay.payer_id,
           payer.name,
           payer.role::text,
           '/dashboard/admin/projects'::text
    FROM public.project_payments pay
    LEFT JOIN public.campaign_projects cp ON cp.id = pay.project_id
    LEFT JOIN public.profiles payer ON payer.id = pay.payer_id
    WHERE coalesce(pay.paid_at, pay.created_at) >= v_since

    -- ── Trouble ───────────────────────────────────────────────────────────
    UNION ALL
    SELECT t.created_at,
           'support_ticket'::text,
           'warn'::text,
           'Support request opened'::text,
           (t.category || ' · ' || t.subject)::text,
           t.user_id,
           p.name,
           p.role::text,
           '/dashboard/admin/support'::text
    FROM public.support_tickets t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE t.created_at >= v_since

    UNION ALL
    SELECT f.created_at,
           'feedback'::text,
           (CASE WHEN f.kind = 'bug' THEN 'warn' ELSE 'info' END)::text,
           ('Feedback: ' || f.kind)::text,
           left(f.message, 140)::text,
           f.user_id,
           p.name,
           p.role::text,
           '/dashboard/admin/feedback'::text
    FROM public.product_feedback f
    LEFT JOIN public.profiles p ON p.id = f.user_id
    WHERE f.created_at >= v_since

    UNION ALL
    SELECT r.created_at,
           'report'::text,
           'bad'::text,
           'User reported'::text,
           r.reason::text,
           r.reporter_id,
           p.name,
           p.role::text,
           '/dashboard/admin/reports'::text
    FROM public.user_reports r
    LEFT JOIN public.profiles p ON p.id = r.reporter_id
    WHERE r.created_at >= v_since
  )
  SELECT e.at, e.kind, e.severity, e.title, e.detail,
         e.actor_id, e.actor_name, e.actor_role, e.link
  FROM events e
  WHERE e.at IS NOT NULL
  ORDER BY e.at DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_activity(INT, INT, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_activity(INT, INT, INT) FROM anon;

-- ---------------------------------------------------------------------------
-- Live counters for the top of the feed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_pulse(p_hours INT DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_hours INT := least(greatest(coalesce(p_hours, 24), 1), 720);
  v_since TIMESTAMPTZ;
  result  jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_since := now() - make_interval(hours => v_hours);

  SELECT jsonb_build_object(
    'window_hours',   v_hours,
    'signups',        (SELECT count(*) FROM public.profiles WHERE created_at >= v_since),
    'active_users',   (SELECT count(DISTINCT actor_user_id) FROM public.project_activity
                        WHERE created_at >= v_since AND actor_user_id IS NOT NULL),
    'requests',       (SELECT count(*) FROM public.collab_requests WHERE created_at >= v_since),
    'projects',       (SELECT count(*) FROM public.campaign_projects WHERE created_at >= v_since),
    'stage_moves',    (SELECT count(*) FROM public.project_activity WHERE created_at >= v_since),
    'payments_paid',  (SELECT count(*) FROM public.project_payments
                        WHERE created_at >= v_since AND status = 'paid'),
    'payments_failed',(SELECT count(*) FROM public.project_payments
                        WHERE created_at >= v_since AND status = 'failed'),
    'tickets',        (SELECT count(*) FROM public.support_tickets WHERE created_at >= v_since),
    'reports',        (SELECT count(*) FROM public.user_reports WHERE created_at >= v_since),
    -- Creators who signed up in the window and are still not verified: the
    -- number that says "onboarding is leaking" during a tester round.
    'stalled_creators', (
      SELECT count(*) FROM public.profiles p
      WHERE p.role::text = 'influencer'
        AND p.created_at >= v_since
        AND p.verification_status <> 'verified'
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_pulse(INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_pulse(INT) FROM anon;
