-- Migration 196: per-section permission checks on admin_* RPCs (G14)
--
-- Known limit, stated plainly in migration 176's closing comment: every
-- admin_* RPC guards itself with is_admin() alone, which only asks "is this
-- an active admin account" — not "does this admin hold the section this RPC
-- reads". The console UI and every /api/admin/* route already enforce
-- per-section view/manage levels (lib/admin-access.ts), but a staff member's
-- own JWT still satisfies is_admin(), so calling one of these RPCs directly
-- through PostgREST (bypassing the Next.js route entirely) reaches data
-- outside their granted sections.
--
-- admin_has_permission() closes that gap: it is what is_admin() plus
-- lib/admin-access.ts's allows() would compute together, kept in one place so
-- every RPC below calls the same function. A super admin (profiles.is_super_
-- admin) always passes; everyone else needs a matching-or-higher level in
-- their admin_members.permissions for the given section. A disabled member
-- fails here too, because is_admin() (which this calls first) already
-- excludes them.
--
-- Below that: every admin_* RPC that was granted EXECUTE to `authenticated`
-- and only checked is_admin() has that check replaced with
-- admin_has_permission('<section>', '<level>') — same section keys as
-- lib/admin-access.ts's ADMIN_MODULES, same level a GET/mutation would need
-- through the matching /api/admin/* route. Nothing else in any function body
-- changes. The admin_team_* functions and friends in migration 176 are not
-- here: they are already revoked from `authenticated` entirely (service-role
-- only), so they were never reachable this way.
--
-- admin_creator_applications_report has no console page yet — mapped to
-- 'early_access', the closest existing section (a creator intake form, same
-- family as the waitlist), so it fails closed rather than staying
-- effectively ungated until a real page is built.

CREATE OR REPLACE FUNCTION public.admin_has_permission(p_section TEXT, p_level TEXT DEFAULT 'view')
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_admin() THEN false
    WHEN (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.admin_members m
       WHERE m.user_id = auth.uid()
         AND public.admin_level_rank(m.permissions ->> p_section) >= public.admin_level_rank(p_level)
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_has_permission(TEXT, TEXT) FROM PUBLIC, anon;

-- admin_decide_verification — gated on 'approvals' (manage), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_decide_verification(
  p_user_id     uuid,
  p_status      text,
  p_notes       text,
  p_notif_type  text,
  p_notif_title text,
  p_notif_body  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urole text;
  ownership_ok boolean;
BEGIN
  IF NOT public.admin_has_permission('approvals', 'manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('verified', 'rejected', 'needs_more_info', 'in_review') THEN
    RAISE EXCEPTION 'Invalid admin status: %', p_status;
  END IF;

  SELECT role INTO urole FROM public.profiles WHERE id = p_user_id;

  -- ANTI-IMPERSONATION GATE, admin side: mirrors the automated gate in
  -- verification.ts decide(). A creator cannot be marked 'verified' — by
  -- anyone, including an admin — without a completed bio-code ownership
  -- handshake. This is deliberately NOT overridable: "the admin trusts this
  -- account" is not proof of who controls the handle.
  IF p_status = 'verified' AND urole = 'influencer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.social_account_claims
      WHERE user_id = p_user_id AND status = 'verified'
    ) INTO ownership_ok;
    IF NOT ownership_ok THEN
      RAISE EXCEPTION
        'Cannot verify this creator: ownership of their social handle has not been confirmed yet (no verified social_account_claims row). Ask them to complete the bio-code verification first, or set status to in_review / needs_more_info instead.';
    END IF;
  END IF;

  -- Resolve the latest open check (if any) for the audit trail.
  UPDATE public.verification_checks
    SET status = p_status, reviewer_notes = p_notes, decided_by = auth.uid()::text, decided_at = now()
  WHERE id = (
    SELECT id FROM public.verification_checks
    WHERE user_id = p_user_id AND status IN ('pending', 'in_review')
    ORDER BY created_at DESC LIMIT 1
  );

  UPDATE public.profiles SET verification_status = p_status, updated_at = now()
  WHERE id = p_user_id;

  -- Keep legacy business approval_status in sync so the old admin screen agrees.
  IF urole = 'business_owner' THEN
    UPDATE public.business_profiles
      SET approval_status = CASE WHEN p_status = 'verified' THEN 'approved'
                                 WHEN p_status = 'rejected' THEN 'rejected'
                                 ELSE 'pending_review' END,
          updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_notif_type, p_notif_title, p_notif_body, '/dashboard/settings');

  RETURN jsonb_build_object('user_id', p_user_id, 'status', p_status);
END;
$$;

-- admin_revoke_social_claim — gated on 'approvals' (manage), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_revoke_social_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.admin_has_permission('approvals', 'manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.social_account_claims
    SET status = 'revoked', updated_at = now()
  WHERE id = p_claim_id;
  RETURN jsonb_build_object('claim_id', p_claim_id, 'status', 'revoked');
END;
$$;

-- admin_get_user_activity — gated on 'users' (view), was is_admin() only
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
  IF NOT public.admin_has_permission('users', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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

-- admin_get_user_signins — gated on 'users' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_get_user_signins(
  p_user_id UUID,
  p_limit   INT DEFAULT 50
)
RETURNS TABLE (
  at         TIMESTAMPTZ,
  action     TEXT,
  ip_address TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.admin_has_permission('users', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  RETURN QUERY
  SELECT a.created_at, a.payload ->> 'action', a.ip_address::text
  FROM auth.audit_log_entries a
  WHERE a.payload ->> 'actor_id' = p_user_id::text
  ORDER BY a.created_at DESC
  LIMIT greatest(1, least(p_limit, 200));
END;
$$;

-- admin_push_device_stats — gated on 'broadcasts' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_push_device_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('broadcasts', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'active_devices',   (SELECT count(*) FROM public.push_devices WHERE disabled_at IS NULL),
    'disabled_devices', (SELECT count(*) FROM public.push_devices WHERE disabled_at IS NOT NULL),
    'users_reachable',  (SELECT count(DISTINCT user_id) FROM public.push_devices WHERE disabled_at IS NULL AND permission = 'granted'),
    'creators_reachable', (SELECT count(DISTINCT d.user_id) FROM public.push_devices d JOIN public.profiles p ON p.id = d.user_id
                            WHERE d.disabled_at IS NULL AND d.permission = 'granted' AND p.role = 'influencer'),
    'businesses_reachable', (SELECT count(DISTINCT d.user_id) FROM public.push_devices d JOIN public.profiles p ON p.id = d.user_id
                            WHERE d.disabled_at IS NULL AND d.permission = 'granted' AND p.role = 'business_owner'),
    'total_users', (SELECT count(*) FROM public.profiles WHERE role IN ('influencer', 'business_owner')),
    'by_platform', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'count', c) ORDER BY c DESC)
                     FROM (SELECT platform, count(*) c FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1) x), '[]'::jsonb),
    'by_version', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'version', v, 'count', c) ORDER BY c DESC)
                    FROM (SELECT platform, coalesce(app_version, 'unknown') v, count(*) c
                          FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1, 2) x), '[]'::jsonb),
    'by_permission', COALESCE((SELECT jsonb_agg(jsonb_build_object('permission', permission, 'count', c))
                       FROM (SELECT permission, count(*) c FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1) x), '[]'::jsonb),
    'disabled_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                          FROM (SELECT coalesce(disabled_reason, 'unknown') r, count(*) c
                                FROM public.push_devices WHERE disabled_at IS NOT NULL GROUP BY 1) x), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_otp_logs — gated on 'otp' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_otp_logs(
  p_from    DATE,
  p_to      DATE,
  p_status  TEXT DEFAULT NULL,     -- sent | verified | failed | expired
  p_purpose TEXT DEFAULT NULL,
  p_phone   TEXT DEFAULT NULL,     -- trailing digits
  p_limit   INT DEFAULT 50,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_from   TIMESTAMPTZ := (coalesce(p_from, current_date - 7)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to     TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_super  BOOLEAN;
  v_hourly BOOLEAN;
  v_digits TEXT := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('otp', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_to - v_from > INTERVAL '367 days' THEN
    RAISE EXCEPTION 'range too large';
  END IF;

  v_super  := public.caller_is_super_admin();
  v_hourly := v_to - v_from <= INTERVAL '2 days';

  WITH s AS (
    SELECT o.*,
           CASE WHEN o.status IN ('sent', 'verifying') AND o.expires_at < now() THEN 'expired'
                ELSE o.status END AS effective_status
    FROM public.phone_otp_sessions o
    WHERE o.created_at >= v_from AND o.created_at < v_to
  ),
  filtered AS (
    SELECT * FROM s
    WHERE (p_status IS NULL OR effective_status = p_status)
      AND (p_purpose IS NULL OR purpose = p_purpose)
      AND (v_digits IS NULL OR regexp_replace(phone_e164, '\D', '', 'g') LIKE '%' || v_digits)
  ),
  audit AS (
    SELECT * FROM public.phone_otp_audit_log a
    WHERE a.created_at >= v_from AND a.created_at < v_to
  )
  SELECT jsonb_build_object(
    'unmasked', v_super,
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'sessions',      (SELECT count(*) FROM s),
      'sends',         (SELECT coalesce(sum(send_attempt), 0) FROM s),
      'verified',      (SELECT count(*) FROM s WHERE effective_status = 'verified'),
      'failed',        (SELECT count(*) FROM s WHERE effective_status = 'failed'),
      'expired',       (SELECT count(*) FROM s WHERE effective_status = 'expired'),
      'pending',       (SELECT count(*) FROM s WHERE effective_status IN ('sent', 'verifying')),
      'success_rate',  (SELECT CASE WHEN count(*) = 0 THEN NULL
                                    ELSE round(100.0 * count(*) FILTER (WHERE effective_status = 'verified') / count(*), 1) END
                        FROM s),
      'wrong_code_attempts', (SELECT count(*) FROM audit WHERE action = 'verify_fail'),
      'unique_phones', (SELECT count(DISTINCT phone_e164) FROM s),
      'resends',       (SELECT coalesce(sum(greatest(send_attempt - 1, 0)), 0) FROM s),
      'median_seconds_to_verify', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                     ORDER BY extract(epoch FROM verified_at - created_at))::numeric, 0)
                                   FROM s WHERE verified_at IS NOT NULL)
    ),
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', b, 'sent', sent, 'verified', verified, 'failed', failed) ORDER BY b)
      FROM (
        SELECT CASE WHEN v_hourly
                    THEN to_char(date_trunc('hour', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD"T"HH24:00')
                    ELSE to_char((created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') END AS b,
               count(*) AS sent,
               count(*) FILTER (WHERE effective_status = 'verified') AS verified,
               count(*) FILTER (WHERE effective_status IN ('failed', 'expired')) AS failed
        FROM s GROUP BY 1
      ) x), '[]'::jsonb),
    'failure_reasons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
      FROM (SELECT coalesce(status, action) r, count(*) c FROM audit WHERE action <> 'send' AND action <> 'verify_success' GROUP BY 1) x
    ), '[]'::jsonb),
    'top_phones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'phone', CASE WHEN v_super THEN phone_e164 ELSE public.mask_phone(phone_e164) END,
               'sessions', c, 'verified', v) ORDER BY c DESC)
      FROM (SELECT phone_e164, count(*) c, count(*) FILTER (WHERE effective_status = 'verified') v
            FROM s GROUP BY 1 HAVING count(*) >= 3 ORDER BY 2 DESC LIMIT 10) x
    ), '[]'::jsonb),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', f.id,
               'created_at', f.created_at,
               'phone', CASE WHEN v_super THEN f.phone_e164 ELSE public.mask_phone(f.phone_e164) END,
               'purpose', f.purpose,
               'status', f.effective_status,
               'send_attempt', f.send_attempt,
               'verify_attempts', f.verify_attempts,
               'verified_at', f.verified_at,
               'expires_at', f.expires_at,
               'provider_session_id', CASE WHEN v_super THEN f.provider_session_id ELSE NULL END,
               'user_id', f.user_id,
               'user_name', p.name,
               'user_role', p.role
             ) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) f
      LEFT JOIN public.profiles p ON p.id = f.user_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_deleted_accounts — gated on 'customers' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_deleted_accounts(
  p_from   DATE,
  p_to     DATE,
  p_via    TEXT DEFAULT NULL,
  p_role   TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_from   TIMESTAMPTZ := (coalesce(p_from, current_date - 90)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to     TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('customers', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT * FROM public.deleted_accounts d
    WHERE d.deleted_at >= v_from AND d.deleted_at < v_to
      AND (p_via IS NULL OR d.deleted_via = p_via OR (p_via = 'self' AND d.deleted_via LIKE 'self_%'))
      AND (p_role IS NULL OR d.role = p_role)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'summary', jsonb_build_object(
      'self',  (SELECT count(*) FROM base WHERE deleted_via LIKE 'self_%'),
      'admin', (SELECT count(*) FROM base WHERE deleted_via = 'admin'),
      'creators',   (SELECT count(*) FROM base WHERE role = 'influencer'),
      'businesses', (SELECT count(*) FROM base WHERE role = 'business_owner'),
      'avg_days_on_platform', (SELECT round(avg(extract(epoch FROM deleted_at - signed_up_at) / 86400)::numeric, 1)
                                FROM base WHERE signed_up_at IS NOT NULL),
      'had_completed_project', (SELECT count(*) FROM base WHERE (stats->>'projects_completed')::INT > 0),
      'by_reason', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                     FROM (SELECT COALESCE(reason_code, 'not_given') r, count(*) c FROM base GROUP BY 1) x), '[]'::jsonb),
      'weekly', COALESCE((SELECT jsonb_agg(jsonb_build_object('week', w, 'self', s, 'admin', a) ORDER BY w)
                  FROM (SELECT date_trunc('week', deleted_at AT TIME ZONE 'Asia/Kolkata')::DATE w,
                               count(*) FILTER (WHERE deleted_via LIKE 'self_%') s,
                               count(*) FILTER (WHERE deleted_via = 'admin') a
                        FROM base GROUP BY 1) x), '[]'::jsonb)
    ),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'email_hash' - 'phone_hash' ORDER BY r.deleted_at DESC)
               FROM (SELECT * FROM base ORDER BY deleted_at DESC LIMIT v_limit OFFSET v_offset) r), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_founder_dashboard — gated on 'founder' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_founder_dashboard(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from  TIMESTAMPTZ := (coalesce(p_from, current_date - 29)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to    TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_len   INTERVAL;
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_price INT;
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('founder', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_to - v_from > INTERVAL '367 days' THEN
    RAISE EXCEPTION 'range too large';
  END IF;
  v_len := v_to - v_from;
  SELECT pro_price_paise INTO v_price FROM public.billing_settings LIMIT 1;

  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', (v_from AT TIME ZONE 'Asia/Kolkata')::DATE,
                                'to', ((v_to - INTERVAL '1 second') AT TIME ZONE 'Asia/Kolkata')::DATE),
    'current',  public.admin_period_kpis(v_from, v_to),
    'previous', public.admin_period_kpis(v_from - v_len, v_from),
    'totals', jsonb_build_object(
      'users',        (SELECT count(*) FROM public.profiles WHERE role <> 'admin'),
      'creators',     (SELECT count(*) FROM public.profiles WHERE role = 'influencer'),
      'businesses',   (SELECT count(*) FROM public.profiles WHERE role = 'business_owner'),
      'verified_creators', (SELECT count(*) FROM public.profiles WHERE role = 'influencer' AND verification_status = 'verified'),
      'approved_businesses', (SELECT count(*) FROM public.business_profiles WHERE approval_status = 'approved'),
      'pending_approvals', (SELECT count(*) FROM public.business_profiles WHERE approval_status = 'pending_review'),
      'pending_verifications', (SELECT count(*) FROM public.profiles WHERE verification_status = 'in_review'),
      'open_tickets', (SELECT count(*) FROM public.support_tickets WHERE status <> 'resolved'),
      'open_reports', (SELECT count(*) FROM public.user_reports WHERE coalesce(status, 'open') <> 'resolved'),
      'active_projects', (SELECT count(*) FROM public.campaign_projects WHERE status = 'active'),
      'live_campaigns',  (SELECT count(*) FROM public.campaigns WHERE status = 'live'),
      'lifetime_gmv_paise', (SELECT coalesce(sum(amount), 0) FROM public.project_payments WHERE status = 'paid'),
      'lifetime_pro_paise', (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders WHERE status = 'paid'),
      'active_pro', (SELECT count(*) FROM public.subscriptions
                      WHERE tier = 'pro' AND status IN ('active', 'authenticated')
                        AND greatest(coalesce(current_period_end, '-infinity'::timestamptz),
                                     coalesce(grace_until, '-infinity'::timestamptz)) > now()),
      'mrr_paise', (SELECT count(*) FROM public.subscriptions
                     WHERE tier = 'pro' AND status IN ('active', 'authenticated')
                       AND greatest(coalesce(current_period_end, '-infinity'::timestamptz),
                                    coalesce(grace_until, '-infinity'::timestamptz)) > now()) * coalesce(v_price, 0)
    ),
    'activity', jsonb_build_object(
      'dau', (SELECT count(DISTINCT user_id) FROM public.user_daily_activity WHERE day_ist = v_today),
      'wau', (SELECT count(DISTINCT user_id) FROM public.user_daily_activity WHERE day_ist > v_today - 7),
      'mau', (SELECT count(DISTINCT user_id) FROM public.user_daily_activity WHERE day_ist > v_today - 28),
      'stickiness', (SELECT CASE WHEN m = 0 THEN NULL ELSE round(100.0 * d / m, 1) END
                     FROM (SELECT (SELECT count(DISTINCT user_id) FROM public.user_daily_activity WHERE day_ist = v_today) d,
                                  (SELECT count(DISTINCT user_id) FROM public.user_daily_activity WHERE day_ist > v_today - 28) m) x)
    ),
    'liquidity', jsonb_build_object(
      'live_campaigns_with_applications_pct', (
        SELECT CASE WHEN count(*) = 0 THEN NULL
               ELSE round(100.0 * count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM public.campaign_applications a WHERE a.campaign_id = c.id)) / count(*), 1) END
        FROM public.campaigns c WHERE c.status = 'live'),
      'request_to_project_pct', (
        SELECT CASE WHEN count(*) = 0 THEN NULL
               ELSE round(100.0 * count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM public.campaign_projects p WHERE p.collab_request_id = r.id)) / count(*), 1) END
        FROM public.collab_requests r WHERE r.created_at >= v_from AND r.created_at < v_to),
      'creators_with_project_pct', (
        SELECT CASE WHEN count(*) = 0 THEN NULL
               ELSE round(100.0 * count(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM public.campaign_projects p
                      WHERE p.owner_user_id = pr.id OR p.counterparty_user_id = pr.id)) / count(*), 1) END
        FROM public.profiles pr WHERE pr.role = 'influencer')
    ),
    'series', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', to_char(d.day, 'YYYY-MM-DD'),
        'signups', (SELECT count(*) FROM public.profiles p
                     WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day AND p.role <> 'admin'),
        'creators', (SELECT count(*) FROM public.profiles p
                     WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day AND p.role = 'influencer'),
        'businesses', (SELECT count(*) FROM public.profiles p
                     WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day AND p.role = 'business_owner'),
        'active', (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist = d.day),
        'requests', (SELECT count(*) FROM public.collab_requests r
                     WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'projects', (SELECT count(*) FROM public.campaign_projects p
                     WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'completed', (SELECT count(*) FROM public.campaign_projects p
                     WHERE (p.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'gmv_paise', (SELECT coalesce(sum(amount), 0) FROM public.project_payments pp
                     WHERE pp.status = 'paid' AND (pp.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'pro_paise', (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders po
                     WHERE po.status = 'paid' AND (po.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day)
      ) ORDER BY d.day)
      FROM (SELECT generate_series((v_from AT TIME ZONE 'Asia/Kolkata')::DATE,
                                   ((v_to - INTERVAL '1 second') AT TIME ZONE 'Asia/Kolkata')::DATE,
                                   INTERVAL '1 day')::DATE AS day) d
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_daily_metrics — gated on 'analytics' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_daily_metrics(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from DATE := coalesce(p_from, current_date - 29);
  v_to   DATE := coalesce(p_to, current_date);
BEGIN
  IF NOT public.admin_has_permission('analytics', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_to - v_from > 366 THEN
    RAISE EXCEPTION 'range too large';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'day', to_char(d.day, 'YYYY-MM-DD'),
      -- users
      'signups_creators',   (SELECT count(*) FROM public.profiles p WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day AND p.role = 'influencer'),
      'signups_businesses', (SELECT count(*) FROM public.profiles p WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day AND p.role = 'business_owner'),
      'verified',           (SELECT count(*) FROM public.profiles p WHERE (p.verified_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'deletions',          (SELECT count(*) FROM public.deleted_accounts x WHERE (x.deleted_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'dau',      (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist = d.day),
      'dau_web',  (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist = d.day AND a.platform = 'web'),
      'dau_ios',  (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist = d.day AND a.platform = 'ios'),
      'dau_android', (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist = d.day AND a.platform = 'android'),
      'wau',      (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist BETWEEN d.day - 6 AND d.day),
      'mau',      (SELECT count(DISTINCT user_id) FROM public.user_daily_activity a WHERE a.day_ist BETWEEN d.day - 27 AND d.day),
      'new_active', (SELECT count(*) FROM (
                        SELECT a.user_id FROM public.user_daily_activity a WHERE a.day_ist = d.day
                        GROUP BY a.user_id
                        HAVING NOT EXISTS (SELECT 1 FROM public.user_daily_activity b
                                           WHERE b.user_id = a.user_id AND b.day_ist < d.day)) x),
      -- marketplace
      'requests_sent',     (SELECT count(*) FROM public.collab_requests r WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'requests_accepted', (SELECT count(*) FROM public.collab_requests r WHERE r.status = 'accepted' AND (r.updated_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'requests_declined', (SELECT count(*) FROM public.collab_requests r WHERE r.status = 'declined' AND (r.updated_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'proposals_sent',    (SELECT count(*) FROM public.project_proposals pp WHERE (pp.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'proposals_accepted',(SELECT count(*) FROM public.project_proposals pp WHERE pp.status = 'accepted' AND (pp.resolved_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'projects_created',  (SELECT count(*) FROM public.campaign_projects p WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'projects_completed',(SELECT count(*) FROM public.campaign_projects p WHERE (p.completed_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'projects_cancelled',(SELECT count(*) FROM public.campaign_projects p WHERE (p.cancelled_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'campaigns_published',(SELECT count(*) FROM public.campaigns c WHERE (c.published_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'applications',      (SELECT count(*) FROM public.campaign_applications a WHERE (a.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      -- money
      'payments_paid',   (SELECT count(*) FROM public.project_payments pp WHERE pp.status = 'paid' AND (pp.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'payments_failed', (SELECT count(*) FROM public.project_payments pp WHERE pp.status = 'failed' AND (pp.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'gmv_paise',       (SELECT coalesce(sum(amount), 0) FROM public.project_payments pp WHERE pp.status = 'paid' AND (pp.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'pro_paid',        (SELECT count(*) FROM public.pro_orders po WHERE po.status = 'paid' AND (po.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'pro_paise',       (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders po WHERE po.status = 'paid' AND (po.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      -- support
      'tickets', (SELECT count(*) FROM public.support_tickets t WHERE (t.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
      'reports', (SELECT count(*) FROM public.user_reports r WHERE (r.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day)
    ) ORDER BY d.day)
    FROM (SELECT generate_series(v_from, v_to, INTERVAL '1 day')::DATE AS day) d
  ), '[]'::jsonb);
END;
$$;

-- admin_product_analytics — gated on 'analytics' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_product_analytics(p_weeks INT DEFAULT 8)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weeks INT := least(greatest(coalesce(p_weeks, 8), 2), 26);
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('analytics', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    -- Creator funnel (extends get_admin_funnel from 098 with the money step).
    'creator_funnel', jsonb_build_array(
      jsonb_build_object('key', 'signed_up', 'label', 'Signed up',
        'value', (SELECT count(*) FROM public.profiles WHERE role = 'influencer')),
      jsonb_build_object('key', 'has_handle', 'label', 'Added a handle',
        'value', (SELECT count(*) FROM public.influencer_profiles ip
                   JOIN public.profiles p ON p.id = ip.user_id AND p.role = 'influencer'
                   WHERE coalesce(ip.instagram_handle, ip.youtube_handle, '') <> '')),
      jsonb_build_object('key', 'ownership_done', 'label', 'Proved ownership',
        'value', (SELECT count(DISTINCT c.user_id) FROM public.social_account_claims c
                   JOIN public.profiles p ON p.id = c.user_id AND p.role = 'influencer'
                   WHERE c.status = 'verified')),
      jsonb_build_object('key', 'verified', 'label', 'Verified',
        'value', (SELECT count(*) FROM public.profiles WHERE role = 'influencer' AND verification_status = 'verified')),
      jsonb_build_object('key', 'in_conversation', 'label', 'In a conversation',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'influencer'
                   AND EXISTS (SELECT 1 FROM public.collab_requests r WHERE r.to_user_id = p.id OR r.from_user_id = p.id))),
      jsonb_build_object('key', 'in_project', 'label', 'In a project',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'influencer'
                   AND EXISTS (SELECT 1 FROM public.campaign_projects c WHERE c.owner_user_id = p.id OR c.counterparty_user_id = p.id))),
      jsonb_build_object('key', 'completed', 'label', 'Completed one',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'influencer'
                   AND EXISTS (SELECT 1 FROM public.campaign_projects c WHERE c.status = 'completed'
                               AND (c.owner_user_id = p.id OR c.counterparty_user_id = p.id)))),
      jsonb_build_object('key', 'paid', 'label', 'Got paid',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'influencer'
                   AND EXISTS (SELECT 1 FROM public.project_payments pp
                               JOIN public.campaign_projects c ON c.id = pp.project_id
                               WHERE pp.status = 'paid' AND pp.payer_id <> p.id
                                 AND (c.owner_user_id = p.id OR c.counterparty_user_id = p.id))))
    ),
    -- Business funnel — never existed before.
    'business_funnel', jsonb_build_array(
      jsonb_build_object('key', 'signed_up', 'label', 'Signed up',
        'value', (SELECT count(*) FROM public.profiles WHERE role = 'business_owner')),
      jsonb_build_object('key', 'profile_done', 'label', 'Completed profile',
        'value', (SELECT count(*) FROM public.business_profiles WHERE coalesce(company_name, '') <> '')),
      jsonb_build_object('key', 'approved', 'label', 'Approved',
        'value', (SELECT count(*) FROM public.business_profiles WHERE approval_status = 'approved')),
      jsonb_build_object('key', 'browsed', 'label', 'Looked at a creator',
        'value', (SELECT count(DISTINCT business_id) FROM public.creator_profile_views WHERE business_id IS NOT NULL)),
      jsonb_build_object('key', 'reached_out', 'label', 'Sent a request or campaign',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'business_owner'
                   AND (EXISTS (SELECT 1 FROM public.collab_requests r WHERE r.from_user_id = p.id)
                        OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.business_user_id = p.id)))),
      jsonb_build_object('key', 'in_project', 'label', 'In a project',
        'value', (SELECT count(DISTINCT p.id) FROM public.profiles p WHERE p.role = 'business_owner'
                   AND EXISTS (SELECT 1 FROM public.campaign_projects c WHERE c.owner_user_id = p.id OR c.counterparty_user_id = p.id))),
      jsonb_build_object('key', 'paid', 'label', 'Paid a creator',
        'value', (SELECT count(DISTINCT payer_id) FROM public.project_payments WHERE status = 'paid')),
      jsonb_build_object('key', 'repeat', 'label', 'Came back for another',
        'value', (SELECT count(*) FROM (SELECT c.owner_user_id FROM public.campaign_projects c
                                        JOIN public.profiles p ON p.id = c.owner_user_id AND p.role = 'business_owner'
                                        GROUP BY 1 HAVING count(*) > 1) x))
    ),
    'time_to_value', jsonb_build_object(
      'signup_to_verified_hours', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                     ORDER BY extract(epoch FROM verified_at - created_at) / 3600)::numeric, 1)
                                   FROM public.profiles WHERE role = 'influencer' AND verified_at >= created_at),
      'signup_to_first_project_hours', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                          ORDER BY extract(epoch FROM fp - p.created_at) / 3600)::numeric, 1)
                                        FROM public.profiles p
                                        JOIN LATERAL (SELECT min(c.created_at) fp FROM public.campaign_projects c
                                                      WHERE c.owner_user_id = p.id OR c.counterparty_user_id = p.id) f ON TRUE
                                        WHERE fp IS NOT NULL AND fp >= p.created_at),
      'project_duration_days', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM completed_at - created_at) / 86400)::numeric, 1)
                                FROM public.campaign_projects WHERE completed_at IS NOT NULL)
    ),
    -- Where active projects are sitting right now.
    'stage_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage', current_stage, 'count', c,
                                          'median_days_in_stage', md) ORDER BY c DESC)
      FROM (SELECT cp.current_stage,
                   count(*) c,
                   round(percentile_cont(0.5) WITHIN GROUP (
                     ORDER BY extract(epoch FROM now() - coalesce(
                       (SELECT max(pa.created_at) FROM public.project_activity pa
                         WHERE pa.project_id = cp.id AND pa.type IN ('stage_advanced', 'stage_skipped')),
                       cp.created_at)) / 86400)::numeric, 1) md
            FROM public.campaign_projects cp
            WHERE cp.status = 'active' AND cp.manually_deleted_at IS NULL
            GROUP BY 1) x), '[]'::jsonb),
    -- Drop-off: of projects that ENTERED a stage, how many left it.
    'stage_dropoff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage', stage, 'entered', entered, 'left', gone,
                                          'median_hours', med) ORDER BY entered DESC)
      FROM (
        SELECT pa.metadata->>'to' AS stage,
               count(DISTINCT pa.project_id) AS entered,
               count(DISTINCT pa.project_id) FILTER (WHERE EXISTS (
                 SELECT 1 FROM public.project_activity nx
                 WHERE nx.project_id = pa.project_id AND nx.created_at > pa.created_at
                   AND nx.type IN ('stage_advanced', 'stage_skipped'))) AS gone,
               round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (
                 SELECT min(nx.created_at) FROM public.project_activity nx
                 WHERE nx.project_id = pa.project_id AND nx.created_at > pa.created_at
                   AND nx.type IN ('stage_advanced', 'stage_skipped')) - pa.created_at) / 3600)::numeric, 1) AS med
        FROM public.project_activity pa
        WHERE pa.type IN ('stage_advanced', 'stage_skipped') AND pa.metadata->>'to' IS NOT NULL
        GROUP BY 1) x), '[]'::jsonb),
    -- Weekly signup cohorts × weeks since, % active. History only goes back as
    -- far as user_daily_activity (migration 152).
    'cohorts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cohort', to_char(w.week, 'YYYY-MM-DD'),
        'size', (SELECT count(*) FROM public.profiles p
                  WHERE p.role <> 'admin'
                    AND date_trunc('week', p.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = w.week),
        'weeks', (SELECT jsonb_agg(jsonb_build_object('week', n, 'active', act) ORDER BY n)
                  FROM (SELECT n,
                               (SELECT count(DISTINCT a.user_id) FROM public.user_daily_activity a
                                 JOIN public.profiles p2 ON p2.id = a.user_id
                                WHERE date_trunc('week', p2.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = w.week
                                  AND a.day_ist BETWEEN w.week + (n * 7) AND w.week + (n * 7) + 6) act
                        FROM generate_series(0, v_weeks - 1) n
                        WHERE w.week + (n * 7) <= (now() AT TIME ZONE 'Asia/Kolkata')::DATE) c)
      ) ORDER BY w.week)
      FROM (SELECT generate_series(
              date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::DATE - ((v_weeks - 1) * 7)),
              date_trunc('week', (now() AT TIME ZONE 'Asia/Kolkata')::DATE),
              INTERVAL '1 week')::DATE AS week) w
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_customer_tracking — gated on 'customers' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_customer_tracking(
  p_search TEXT DEFAULT NULL,
  p_role   TEXT DEFAULT NULL,
  p_stage  TEXT DEFAULT NULL,
  p_tier   TEXT DEFAULT NULL,
  p_city   TEXT DEFAULT NULL,
  p_dormant_days INT DEFAULT NULL,
  p_sort   TEXT DEFAULT 'recent',   -- recent | gmv | projects | oldest
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_q      TEXT := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_super  BOOLEAN := public.caller_is_super_admin();
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('customers', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH people AS (
    SELECT p.id, p.name, p.email, p.phone, p.role::TEXT AS role, p.created_at, p.last_active_at,
           p.verification_status,
           COALESCE(ip.city, bp.city, p.location) AS city,
           bp.approval_status, bp.company_name, ip.username AS creator_username,
           public.current_tier(p.id)::TEXT AS tier,
           public.user_lifecycle_stage(p.id, p.role::TEXT) AS stage,
           (SELECT count(*) FROM public.collab_requests r WHERE r.from_user_id = p.id OR r.to_user_id = p.id) AS requests,
           (SELECT count(*) FROM public.campaign_projects c WHERE c.owner_user_id = p.id OR c.counterparty_user_id = p.id) AS projects,
           (SELECT count(*) FROM public.campaign_projects c WHERE c.status = 'completed'
             AND (c.owner_user_id = p.id OR c.counterparty_user_id = p.id)) AS completed,
           (SELECT coalesce(sum(pp.amount), 0) FROM public.project_payments pp
             WHERE pp.status = 'paid' AND pp.payer_id = p.id) AS paid_paise,
           (SELECT coalesce(sum(pp.amount), 0) FROM public.project_payments pp
             JOIN public.campaign_projects c ON c.id = pp.project_id
             WHERE pp.status = 'paid' AND pp.payer_id <> p.id
               AND (c.owner_user_id = p.id OR c.counterparty_user_id = p.id)) AS earned_paise,
           (SELECT count(*) FROM public.support_tickets t WHERE t.user_id = p.id AND t.status <> 'resolved') AS open_tickets,
           (SELECT count(*) FROM public.user_reports r WHERE r.reported_id = p.id) AS reports_against,
           (SELECT count(*) FROM public.push_devices d WHERE d.user_id = p.id AND d.disabled_at IS NULL) AS devices
    FROM public.profiles p
    LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
    LEFT JOIN public.business_profiles  bp ON bp.user_id = p.id
    WHERE p.role::TEXT IN ('influencer', 'business_owner')
  ),
  filtered AS (
    SELECT * FROM people
    WHERE (p_role IS NULL OR role = p_role)
      AND (p_stage IS NULL OR stage = p_stage)
      AND (p_tier IS NULL OR tier = p_tier)
      AND (p_city IS NULL OR lower(coalesce(city, '')) = lower(p_city))
      AND (p_dormant_days IS NULL OR last_active_at IS NULL
           OR last_active_at < now() - make_interval(days => p_dormant_days))
      AND (v_q IS NULL
           OR lower(coalesce(name, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(email, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(company_name, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(creator_username, '')) LIKE '%' || v_q || '%'
           OR replace(coalesce(phone, ''), ' ', '') LIKE '%' || replace(v_q, ' ', '') || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'creators',   (SELECT count(*) FROM people WHERE role = 'influencer'),
      'businesses', (SELECT count(*) FROM people WHERE role = 'business_owner'),
      'pro',        (SELECT count(*) FROM people WHERE tier = 'pro'),
      'dormant_14d',(SELECT count(*) FROM people WHERE last_active_at IS NULL OR last_active_at < now() - INTERVAL '14 days'),
      'by_stage', COALESCE((SELECT jsonb_agg(jsonb_build_object('role', role, 'stage', stage, 'count', c))
                    FROM (SELECT role, stage, count(*) c FROM people GROUP BY 1, 2) x), '[]'::jsonb)
    ),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'name', f.name, 'email', f.email,
        'phone', CASE WHEN v_super THEN f.phone ELSE public.mask_phone(f.phone) END,
        'role', f.role, 'company_name', f.company_name, 'username', f.creator_username,
        'city', f.city, 'tier', f.tier, 'stage', f.stage,
        'verification_status', f.verification_status, 'approval_status', f.approval_status,
        'created_at', f.created_at, 'last_active_at', f.last_active_at,
        'requests', f.requests, 'projects', f.projects, 'completed', f.completed,
        'paid_paise', f.paid_paise, 'earned_paise', f.earned_paise,
        'open_tickets', f.open_tickets, 'reports_against', f.reports_against, 'devices', f.devices)
      ORDER BY
        CASE WHEN p_sort = 'gmv' THEN (f.paid_paise + f.earned_paise) END DESC NULLS LAST,
        CASE WHEN p_sort = 'projects' THEN f.projects END DESC NULLS LAST,
        CASE WHEN p_sort = 'oldest' THEN f.created_at END ASC,
        CASE WHEN p_sort NOT IN ('gmv', 'projects', 'oldest') THEN coalesce(f.last_active_at, f.created_at) END DESC)
      FROM (SELECT * FROM filtered
            ORDER BY
              CASE WHEN p_sort = 'gmv' THEN (paid_paise + earned_paise) END DESC NULLS LAST,
              CASE WHEN p_sort = 'projects' THEN projects END DESC NULLS LAST,
              CASE WHEN p_sort = 'oldest' THEN created_at END ASC,
              CASE WHEN p_sort NOT IN ('gmv', 'projects', 'oldest') THEN coalesce(last_active_at, created_at) END DESC
            LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_incomplete_signups — gated on 'customers' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_incomplete_signups(
  p_bucket TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('customers', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH buckets AS (
    -- An auth user that never became a profile: the signup wizard was abandoned
    -- after the account was created.
    SELECT 'orphan_auth' AS bucket, u.id, NULL::TEXT AS name, u.email, NULL::TEXT AS role,
           u.created_at, NULL::TIMESTAMPTZ AS last_active_at,
           (u.email_confirmed_at IS NOT NULL) AS email_confirmed
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
    UNION ALL
    SELECT 'creator_no_handle', p.id, p.name, p.email, p.role::TEXT, p.created_at, p.last_active_at, TRUE
    FROM public.profiles p
    LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
    WHERE p.role = 'influencer' AND coalesce(ip.instagram_handle, ip.youtube_handle, '') = ''
    UNION ALL
    SELECT 'creator_no_ownership', p.id, p.name, p.email, p.role::TEXT, p.created_at, p.last_active_at, TRUE
    FROM public.profiles p
    JOIN public.influencer_profiles ip ON ip.user_id = p.id
    WHERE p.role = 'influencer' AND coalesce(ip.instagram_handle, ip.youtube_handle, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM public.social_account_claims s WHERE s.user_id = p.id AND s.status = 'verified')
    UNION ALL
    SELECT 'creator_not_verified', p.id, p.name, p.email, p.role::TEXT, p.created_at, p.last_active_at, TRUE
    FROM public.profiles p
    WHERE p.role = 'influencer' AND p.verification_status <> 'verified'
      AND EXISTS (SELECT 1 FROM public.social_account_claims s WHERE s.user_id = p.id AND s.status = 'verified')
    UNION ALL
    SELECT 'business_pending_approval', p.id, p.name, p.email, p.role::TEXT, p.created_at, p.last_active_at, TRUE
    FROM public.profiles p
    JOIN public.business_profiles bp ON bp.user_id = p.id
    WHERE bp.approval_status = 'pending_review'
    UNION ALL
    -- Approved more than 7 days ago and has still never reached out.
    SELECT 'business_no_activity', p.id, p.name, p.email, p.role::TEXT, p.created_at, p.last_active_at, TRUE
    FROM public.profiles p
    JOIN public.business_profiles bp ON bp.user_id = p.id
    WHERE bp.approval_status = 'approved' AND p.created_at < now() - INTERVAL '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.collab_requests r WHERE r.from_user_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.business_user_id = p.id)
  ),
  filtered AS (SELECT * FROM buckets WHERE p_bucket IS NULL OR bucket = p_bucket)
  SELECT jsonb_build_object(
    'counts', COALESCE((SELECT jsonb_object_agg(bucket, c)
                        FROM (SELECT bucket, count(*) c FROM buckets GROUP BY 1) x), '{}'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'bucket', f.bucket, 'id', f.id, 'name', f.name, 'email', f.email, 'role', f.role,
        'created_at', f.created_at, 'last_active_at', f.last_active_at,
        'email_confirmed', f.email_confirmed,
        'age_days', floor(extract(epoch FROM now() - f.created_at) / 86400)::INT,
        'reachable_push', EXISTS (SELECT 1 FROM public.push_devices d
                                   WHERE d.user_id = f.id AND d.disabled_at IS NULL)
      ) ORDER BY f.created_at DESC)
      FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_app_activity — gated on 'app_activity' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_app_activity(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from DATE := coalesce(p_from, current_date - 29);
  v_to   DATE := coalesce(p_to, current_date);
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('app_activity', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_to - v_from > 366 THEN
    RAISE EXCEPTION 'range too large';
  END IF;

  WITH a AS (
    SELECT * FROM public.user_daily_activity WHERE day_ist BETWEEN v_from AND v_to
  )
  SELECT jsonb_build_object(
    'history_starts', (SELECT min(day_ist) FROM public.user_daily_activity),
    'totals', jsonb_build_object(
      'active_users', (SELECT count(DISTINCT user_id) FROM a),
      'sessions',     (SELECT coalesce(sum(hits), 0) FROM a),
      'web',     (SELECT count(DISTINCT user_id) FROM a WHERE platform = 'web'),
      'ios',     (SELECT count(DISTINCT user_id) FROM a WHERE platform = 'ios'),
      'android', (SELECT count(DISTINCT user_id) FROM a WHERE platform = 'android'),
      'mobile_only', (SELECT count(*) FROM (
                        SELECT user_id FROM a GROUP BY user_id
                        HAVING count(*) FILTER (WHERE platform IN ('ios', 'android')) > 0
                           AND count(*) FILTER (WHERE platform = 'web') = 0) x)
    ),
    'by_platform_day', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'), 'platform', platform, 'users', u) ORDER BY d)
      FROM (SELECT day_ist d, platform, count(DISTINCT user_id) u FROM a GROUP BY 1, 2) x), '[]'::jsonb),
    'versions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('platform', platform, 'version', v, 'users', u) ORDER BY u DESC)
      FROM (SELECT platform, coalesce(app_version, 'unknown') v, count(DISTINCT user_id) u
            FROM a WHERE platform IN ('ios', 'android') GROUP BY 1, 2) x), '[]'::jsonb),
    -- 7 × 24 grid: ISO weekday (1=Mon) × IST hour, counted from the per-day
    -- hour bitmap so there is one row per user-day, not one per request.
    'heatmap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', wd, 'hour', h, 'active', c) ORDER BY wd, h)
      FROM (SELECT extract(isodow FROM a.day_ist)::INT wd, g.h, count(*) c
            FROM a, generate_series(0, 23) g(h)
            WHERE (a.hours_bitmap & (1 << g.h)) <> 0
            GROUP BY 1, 2) x), '[]'::jsonb),
    'push', public.admin_push_device_stats()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_marketplace — gated on 'marketplace' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_marketplace(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from TIMESTAMPTZ := (coalesce(p_from, current_date - 29)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to   TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('marketplace', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'campaigns', jsonb_build_object(
      'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                     FROM (SELECT status, count(*) c FROM public.campaigns GROUP BY 1) x), '{}'::jsonb),
      'created_in_range', (SELECT count(*) FROM public.campaigns WHERE created_at >= v_from AND created_at < v_to),
      'applications_in_range', (SELECT count(*) FROM public.campaign_applications WHERE created_at >= v_from AND created_at < v_to),
      'median_applications', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY n)::numeric, 1)
                              FROM (SELECT (SELECT count(*) FROM public.campaign_applications a WHERE a.campaign_id = c.id) n
                                    FROM public.campaigns c WHERE c.status = 'live') y),
      'live_without_applications', (SELECT count(*) FROM public.campaigns c
                                     WHERE c.status = 'live'
                                       AND NOT EXISTS (SELECT 1 FROM public.campaign_applications a WHERE a.campaign_id = c.id)),
      'median_hours_to_first_application', (
        SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM t) / 3600)::numeric, 1)
        FROM (SELECT (SELECT min(a.created_at) FROM public.campaign_applications a WHERE a.campaign_id = c.id) - c.published_at t
              FROM public.campaigns c WHERE c.published_at IS NOT NULL) z WHERE t IS NOT NULL),
      'application_outcomes', COALESCE((SELECT jsonb_object_agg(status, c)
                     FROM (SELECT status, count(*) c FROM public.campaign_applications GROUP BY 1) x), '{}'::jsonb),
      'top_categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', cat, 'count', c) ORDER BY c DESC)
                     FROM (SELECT unnest(categories) cat, count(*) c FROM public.campaigns
                           WHERE categories IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb),
      'top_locations', COALESCE((SELECT jsonb_agg(jsonb_build_object('location', loc, 'count', c) ORDER BY c DESC)
                     FROM (SELECT coalesce(nullif(location, ''), 'Anywhere') loc, count(*) c FROM public.campaigns
                           GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x), '[]'::jsonb)
    ),
    'projects', jsonb_build_object(
      'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                     FROM (SELECT status, count(*) c FROM public.campaign_projects GROUP BY 1) x), '{}'::jsonb),
      'manually_deleted', (SELECT count(*) FROM public.campaign_projects WHERE manually_deleted_at IS NOT NULL),
      'created_in_range', (SELECT count(*) FROM public.campaign_projects WHERE created_at >= v_from AND created_at < v_to),
      'completed_in_range', (SELECT count(*) FROM public.campaign_projects WHERE completed_at >= v_from AND completed_at < v_to),
      'completion_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                                 ELSE round(100.0 * count(*) FILTER (WHERE status = 'completed') / count(*), 1) END
                          FROM public.campaign_projects WHERE status <> 'active'),
      'median_duration_days', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                 ORDER BY extract(epoch FROM completed_at - created_at) / 86400)::numeric, 1)
                               FROM public.campaign_projects WHERE completed_at >= created_at),
      'cancel_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                     FROM (SELECT coalesce(cancel_reason_category, 'not_given') r, count(*) c
                           FROM public.campaign_projects WHERE status = 'cancelled' GROUP BY 1) x), '[]'::jsonb),
      'cancelled_at_stage', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', s, 'count', c) ORDER BY c DESC)
                     FROM (SELECT current_stage s, count(*) c FROM public.campaign_projects
                           WHERE status = 'cancelled' GROUP BY 1) x), '[]'::jsonb),
      -- Live projects with no activity for 7+ days: the nudge list.
      'stuck', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', cp.id, 'title', cp.title, 'stage', cp.current_stage,
                    'owner', ow.name, 'counterparty', cn.name,
                    'days_idle', floor(extract(epoch FROM now() - coalesce(la.at, cp.created_at)) / 86400)::INT)
                  ORDER BY coalesce(la.at, cp.created_at))
                  FROM public.campaign_projects cp
                  LEFT JOIN public.profiles ow ON ow.id = cp.owner_user_id
                  LEFT JOIN public.profiles cn ON cn.id = cp.counterparty_user_id
                  LEFT JOIN LATERAL (SELECT max(pa.created_at) at FROM public.project_activity pa
                                     WHERE pa.project_id = cp.id) la ON TRUE
                  WHERE cp.status = 'active' AND cp.manually_deleted_at IS NULL
                    AND coalesce(la.at, cp.created_at) < now() - INTERVAL '7 days'
                  LIMIT 50), '[]'::jsonb)
    ),
    'requests', jsonb_build_object(
      'by_status', COALESCE((SELECT jsonb_object_agg(status, c)
                     FROM (SELECT status::TEXT, count(*) c FROM public.collab_requests GROUP BY 1) x), '{}'::jsonb),
      'sent_in_range', (SELECT count(*) FROM public.collab_requests WHERE created_at >= v_from AND created_at < v_to),
      'accept_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                             ELSE round(100.0 * count(*) FILTER (WHERE status = 'accepted') / count(*), 1) END
                      FROM public.collab_requests WHERE status <> 'pending'),
      'median_response_hours', (SELECT round(percentile_cont(0.5) WITHIN GROUP (
                                  ORDER BY extract(epoch FROM updated_at - created_at) / 3600)::numeric, 1)
                                FROM public.collab_requests WHERE status <> 'pending' AND updated_at > created_at),
      'awaiting_response', (SELECT count(*) FROM public.collab_requests WHERE status = 'pending'),
      'awaiting_over_48h', (SELECT count(*) FROM public.collab_requests
                             WHERE status = 'pending' AND created_at < now() - INTERVAL '48 hours'),
      'proposals', COALESCE((SELECT jsonb_object_agg(status, c)
                     FROM (SELECT status, count(*) c FROM public.project_proposals GROUP BY 1) x), '{}'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_engagement — gated on 'marketplace' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_engagement(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fromd DATE := coalesce(p_from, current_date - 29);
  v_tod   DATE := coalesce(p_to, current_date);
  v_from  TIMESTAMPTZ := (v_fromd::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to    TIMESTAMPTZ := ((v_tod + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('marketplace', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_tod - v_fromd > 366 THEN
    RAISE EXCEPTION 'range too large';
  END IF;

  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'creator_profile_views', (SELECT count(*) FROM public.profile_views WHERE viewed_at >= v_from AND viewed_at < v_to),
      'business_profile_views', (SELECT count(*) FROM public.business_profile_views WHERE viewed_at >= v_from AND viewed_at < v_to),
      'link_clicks', (SELECT count(*) FROM public.profile_link_clicks WHERE clicked_at >= v_from AND clicked_at < v_to),
      'contact_reveals', (SELECT count(*) FROM public.business_contact_reveals WHERE revealed_at >= v_from AND revealed_at < v_to),
      'saves', (SELECT count(*) FROM public.saved_items WHERE created_at >= v_from AND created_at < v_to),
      'pinned_chats', (SELECT count(*) FROM public.conversation_pins),
      'notifications', (SELECT count(*) FROM public.notifications WHERE created_at >= v_from AND created_at < v_to)
    ),
    'views_series', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'),
                        'creator_views', (SELECT count(*) FROM public.profile_views v WHERE v.viewed_on = d.day),
                        'business_views', (SELECT count(*) FROM public.business_profile_views v WHERE v.viewed_on = d.day),
                        'link_clicks', (SELECT count(*) FROM public.profile_link_clicks c WHERE c.clicked_on = d.day)
                      ) ORDER BY d.day)
                      FROM (SELECT generate_series(v_fromd, v_tod, INTERVAL '1 day')::DATE AS day) d), '[]'::jsonb),
    'link_types', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', link_type, 'count', c) ORDER BY c DESC)
                    FROM (SELECT link_type, count(*) c FROM public.profile_link_clicks
                          WHERE clicked_at >= v_from AND clicked_at < v_to GROUP BY 1) x), '[]'::jsonb),
    'saved_kinds', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'count', c) ORDER BY c DESC)
                    FROM (SELECT kind, count(*) c FROM public.saved_items GROUP BY 1) x), '[]'::jsonb),
    'most_viewed_creators', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', u, 'name', n, 'views', c) ORDER BY c DESC)
                    FROM (SELECT v.influencer_user_id u, p.name n, count(*) c
                          FROM public.profile_views v JOIN public.profiles p ON p.id = v.influencer_user_id
                          WHERE v.viewed_at >= v_from AND v.viewed_at < v_to
                          GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10) x), '[]'::jsonb),
    'notifications_by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'type', type, 'sent', c, 'read', r,
                        'read_rate', CASE WHEN c = 0 THEN NULL ELSE round(100.0 * r / c, 1) END,
                        'median_minutes_to_read', med) ORDER BY c DESC)
                    FROM (SELECT type, count(*) c, count(*) FILTER (WHERE read_at IS NOT NULL) r,
                                 round(percentile_cont(0.5) WITHIN GROUP (
                                   ORDER BY extract(epoch FROM read_at - created_at) / 60)::numeric, 1) med
                          FROM public.notifications
                          WHERE created_at >= v_from AND created_at < v_to GROUP BY 1) x), '[]'::jsonb),
    -- Did a nudge bring anyone back? Active within 72 h of receiving one.
    'nudges', (SELECT jsonb_build_object(
                 'sent', count(*),
                 'returned_within_72h', count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM public.user_daily_activity a
                    WHERE a.user_id = n.user_id
                      AND a.last_seen_at > n.created_at
                      AND a.last_seen_at < n.created_at + INTERVAL '72 hours')))
               FROM public.notifications n
               WHERE n.type = 'nudge' AND n.created_at >= v_from AND n.created_at < v_to),
    'emails', (SELECT jsonb_build_object(
                 'sent', count(*) FILTER (WHERE status = 'sent'),
                 'failed', count(*) FILTER (WHERE status <> 'sent'),
                 'by_template', COALESCE(jsonb_object_agg(template, c) FILTER (WHERE template IS NOT NULL), '{}'::jsonb))
               FROM (SELECT status, template, count(*) OVER (PARTITION BY template) c
                     FROM public.email_deliveries
                     WHERE created_at >= v_from AND created_at < v_to) e)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_preview_audience — gated on 'broadcasts' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_preview_audience(p_segment JSONB, p_kind TEXT DEFAULT 'announcement')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat    TEXT := public.broadcast_category(p_kind);
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('broadcasts', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH a AS (SELECT user_id FROM public.broadcast_audience_ids(p_segment))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'creators', (SELECT count(*) FROM a JOIN public.profiles p ON p.id = a.user_id WHERE p.role = 'influencer'),
    'businesses', (SELECT count(*) FROM a JOIN public.profiles p ON p.id = a.user_id WHERE p.role = 'business_owner'),
    'with_push_device', (SELECT count(DISTINCT d.user_id) FROM a JOIN public.push_devices d
                          ON d.user_id = a.user_id AND d.disabled_at IS NULL AND d.permission = 'granted'),
    'push_devices', (SELECT count(*) FROM a JOIN public.push_devices d
                      ON d.user_id = a.user_id AND d.disabled_at IS NULL AND d.permission = 'granted'),
    'push_opted_out', (SELECT count(*) FROM a JOIN public.notification_preferences np
                        ON np.user_id = a.user_id AND np.category = v_cat AND NOT np.push),
    'email_opted_out', (SELECT count(*) FROM a JOIN public.notification_preferences np
                         ON np.user_id = a.user_id AND np.category = v_cat AND NOT np.email),
    'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role))
                        FROM (SELECT user_id FROM a LIMIT 8) s JOIN public.profiles p ON p.id = s.user_id), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- admin_broadcasts — gated on 'broadcasts' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_broadcasts(
  p_status TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('broadcasts', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.broadcasts WHERE p_status IS NULL OR status = p_status),
    'summary', jsonb_build_object(
      'scheduled', (SELECT count(*) FROM public.broadcasts WHERE status = 'scheduled'),
      'recurring', (SELECT count(*) FROM public.broadcasts WHERE status = 'scheduled' AND frequency <> 'once'),
      'sent_30d',  (SELECT count(*) FROM public.broadcast_runs WHERE NOT is_test AND started_at > now() - INTERVAL '30 days'),
      'push_sent_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.channel = 'push' AND d.status IN ('sent', 'delivered')
                          AND d.sent_at > now() - INTERVAL '30 days'),
      'push_delivered_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.channel = 'push' AND d.status = 'delivered'
                          AND d.sent_at > now() - INTERVAL '30 days'),
      'opened_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.opened_at > now() - INTERVAL '30 days')
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind, 'title', b.title, 'body', b.body,
        'channels', b.channels, 'in_app_style', b.in_app_style, 'status', b.status,
        'frequency', b.frequency, 'send_at', b.send_at, 'time_ist', b.time_ist,
        'by_weekday', b.by_weekday, 'by_monthday', b.by_monthday,
        'audience', b.audience, 'system_owned', b.system_owned,
        'created_at', b.created_at, 'last_run_at', b.last_run_at,
        'created_by_name', cb.name,
        'runs', (SELECT count(*) FROM public.broadcast_runs r WHERE r.broadcast_id = b.id AND NOT r.is_test),
        'stats', (SELECT jsonb_build_object(
                    'targeted', coalesce(sum(r.targeted), 0),
                    'sent', coalesce(sum((r.stats->>'sent')::INT), 0),
                    'delivered', coalesce(sum((r.stats->>'delivered')::INT), 0),
                    'errors', coalesce(sum((r.stats->>'errors')::INT), 0),
                    'skipped', coalesce(sum((r.stats->>'skipped')::INT), 0),
                    'opened', coalesce(sum((r.stats->>'opened')::INT), 0))
                  FROM public.broadcast_runs r WHERE r.broadcast_id = b.id AND NOT r.is_test)
      ) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM public.broadcasts
            WHERE p_status IS NULL OR status = p_status
            ORDER BY created_at DESC
            LIMIT least(greatest(coalesce(p_limit, 50), 1), 200) OFFSET greatest(coalesce(p_offset, 0), 0)) b
      LEFT JOIN public.profiles cb ON cb.id = b.created_by
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- admin_broadcast_detail — gated on 'broadcasts' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_broadcast_detail(
  p_id     UUID,
  p_status TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('broadcasts', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'broadcast', (SELECT to_jsonb(b) || jsonb_build_object('created_by_name', p.name, 'approved_by_name', ap.name)
                  FROM public.broadcasts b
                  LEFT JOIN public.profiles p ON p.id = b.created_by
                  LEFT JOIN public.profiles ap ON ap.id = b.approved_by
                  WHERE b.id = p_id),
    'runs', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
                      FROM public.broadcast_runs r WHERE r.broadcast_id = p_id), '[]'::jsonb),
    'by_channel', COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'count', c))
                            FROM (SELECT d.channel, d.status, count(*) c FROM public.broadcast_deliveries d
                                  WHERE d.broadcast_id = p_id GROUP BY 1, 2) x), '[]'::jsonb),
    'skip_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                              FROM (SELECT coalesce(skip_reason, error_code) r, count(*) c FROM public.broadcast_deliveries
                                    WHERE broadcast_id = p_id AND status IN ('skipped', 'error') GROUP BY 1) x), '[]'::jsonb),
    'announcement', (SELECT jsonb_build_object(
                        'seen', count(*) FILTER (WHERE seen_at IS NOT NULL),
                        'dismissed', count(*) FILTER (WHERE dismissed_at IS NOT NULL),
                        'clicked', count(*) FILTER (WHERE clicked_at IS NOT NULL))
                     FROM public.announcement_views WHERE broadcast_id = p_id),
    'total_deliveries', (SELECT count(*) FROM public.broadcast_deliveries
                         WHERE broadcast_id = p_id AND (p_status IS NULL OR status = p_status)),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'run_id', d.run_id, 'user_id', d.user_id, 'user_name', p.name, 'user_role', p.role,
        'channel', d.channel, 'status', d.status, 'skip_reason', d.skip_reason,
        'platform', pd.platform, 'error_code', d.error_code, 'error_message', d.error_message,
        'sent_at', d.sent_at, 'delivered_at', d.delivered_at, 'opened_at', d.opened_at, 'created_at', d.created_at
      ) ORDER BY d.id DESC)
      FROM (SELECT * FROM public.broadcast_deliveries
            WHERE broadcast_id = p_id AND (p_status IS NULL OR status = p_status)
            ORDER BY id DESC
            LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000) OFFSET greatest(coalesce(p_offset, 0), 0)) d
      LEFT JOIN public.profiles p ON p.id = d.user_id
      LEFT JOIN public.push_devices pd ON pd.id = d.device_id
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

-- admin_event_registrations_report — gated on 'events' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_event_registrations_report(
  p_search TEXT DEFAULT '',
  p_status TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search TEXT := trim(coalesce(p_search, ''));
  v_status TEXT := trim(coalesce(p_status, ''));
  v_digits TEXT := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
  v_summary JSONB;
  v_total INT;
  v_rows JSONB;
BEGIN
  IF NOT public.admin_has_permission('events', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
           'total', count(*) FILTER (WHERE deleted_at IS NULL),
           'checked_in', count(*) FILTER (WHERE deleted_at IS NULL AND checked_in_at IS NOT NULL),
           'with_instagram', count(*) FILTER (WHERE deleted_at IS NULL AND instagram_handle IS NOT NULL),
           'today', count(*) FILTER (
             WHERE deleted_at IS NULL
               AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
           ),
           'latest_at', max(created_at) FILTER (WHERE deleted_at IS NULL),
           'deleted', count(*) FILTER (WHERE deleted_at IS NOT NULL)
         )
    INTO v_summary
    FROM public.event_registrations;

  WITH filtered AS (
    SELECT *
      FROM public.event_registrations r
     WHERE (v_search = '' OR
              r.name ILIKE '%' || v_search || '%' OR
              r.email ILIKE '%' || v_search || '%' OR
              r.location ILIKE '%' || v_search || '%' OR
              r.instagram_handle ILIKE '%' || ltrim(v_search, '@') || '%' OR
              r.pass_code ILIKE '%' || v_search || '%' OR
              (length(v_digits) >= 4 AND r.phone_digits LIKE '%' || v_digits || '%'))
       AND CASE v_status
             WHEN 'deleted' THEN r.deleted_at IS NOT NULL
             WHEN 'checked_in' THEN r.deleted_at IS NULL AND r.checked_in_at IS NOT NULL
             WHEN 'not_checked_in' THEN r.deleted_at IS NULL AND r.checked_in_at IS NULL
             ELSE r.deleted_at IS NULL
           END
  )
  SELECT (SELECT count(*) FROM filtered),
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', f.id,
                    'pass_code', f.pass_code,
                    'name', f.name,
                    'phone', f.phone,
                    'phone_digits', f.phone_digits,
                    'email', f.email,
                    'location', f.location,
                    'instagram_handle', f.instagram_handle,
                    'event_slug', f.event_slug,
                    'checked_in_at', f.checked_in_at,
                    'deleted_at', f.deleted_at,
                    'created_at', f.created_at
                  ) ORDER BY coalesce(f.deleted_at, f.created_at) DESC)
             FROM (SELECT * FROM filtered
                    ORDER BY coalesce(deleted_at, created_at) DESC
                    LIMIT LEAST(GREATEST(p_limit, 1), 500)
                   OFFSET GREATEST(p_offset, 0)) f
         ), '[]'::jsonb)
    INTO v_total, v_rows;

  RETURN jsonb_build_object('summary', v_summary, 'total', v_total, 'rows', v_rows);
END;
$$;

-- admin_payments_ledger — gated on 'payments' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_payments_ledger(
  p_from   DATE,
  p_to     DATE,
  p_flow   TEXT DEFAULT NULL,   -- project | pro
  p_status TEXT DEFAULT NULL,   -- pending | abandoned | paid | failed | refunded
  p_search TEXT DEFAULT NULL,   -- name / email / order id / payment id
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_from   TIMESTAMPTZ := (coalesce(p_from, current_date - 30)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to     TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_q      TEXT := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('payments', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_to - v_from > INTERVAL '367 days' THEN
    RAISE EXCEPTION 'range too large';
  END IF;

  WITH ledger AS (
    SELECT pp.id::TEXT AS id,
           'project'::TEXT AS flow,
           pp.stage_key AS kind,
           pp.amount AS amount_paise,
           pp.currency,
           CASE WHEN pp.status = 'created' AND pp.created_at < now() - INTERVAL '1 hour' THEN 'abandoned'
                WHEN pp.status = 'created' THEN 'pending'
                ELSE pp.status END AS status,
           pp.payer_id,
           CASE WHEN cp.owner_user_id = pp.payer_id THEN cp.counterparty_user_id ELSE cp.owner_user_id END AS payee_id,
           pp.project_id,
           cp.title AS project_title,
           pp.razorpay_order_id,
           pp.razorpay_payment_id,
           pp.failure_reason,
           pp.created_at,
           pp.paid_at
    FROM public.project_payments pp
    LEFT JOIN public.campaign_projects cp ON cp.id = pp.project_id
    WHERE pp.created_at >= v_from AND pp.created_at < v_to
    UNION ALL
    SELECT po.razorpay_order_id,
           'pro',
           CASE WHEN po.is_renewal THEN 'pro_renewal' ELSE 'pro_new' END,
           po.amount_paise,
           po.currency,
           CASE WHEN po.status = 'created' AND po.created_at < now() - INTERVAL '1 hour' THEN 'abandoned'
                WHEN po.status = 'created' THEN 'pending'
                ELSE po.status END,
           po.user_id,
           NULL::UUID,
           NULL::BIGINT,
           NULL::TEXT,
           po.razorpay_order_id,
           po.razorpay_payment_id,
           po.failure_reason,
           po.created_at,
           po.paid_at
    FROM public.pro_orders po
    WHERE po.created_at >= v_from AND po.created_at < v_to
  ),
  named AS (
    SELECT l.*, payer.name AS payer_name, payer.email AS payer_email, payer.role::TEXT AS payer_role,
           payee.name AS payee_name
    FROM ledger l
    LEFT JOIN public.profiles payer ON payer.id = l.payer_id
    LEFT JOIN public.profiles payee ON payee.id = l.payee_id
  ),
  filtered AS (
    SELECT * FROM named
    WHERE (p_flow IS NULL OR flow = p_flow)
      AND (p_status IS NULL OR status = p_status)
      AND (v_q IS NULL
           OR lower(coalesce(payer_name, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(payer_email, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(payee_name, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(razorpay_order_id, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(razorpay_payment_id, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(project_title, '')) LIKE '%' || v_q || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'gmv_paise',        (SELECT coalesce(sum(amount_paise), 0) FROM named WHERE flow = 'project' AND status = 'paid'),
      'pro_revenue_paise',(SELECT coalesce(sum(amount_paise), 0) FROM named WHERE flow = 'pro' AND status = 'paid'),
      'paid',      (SELECT count(*) FROM named WHERE status = 'paid'),
      'failed',    (SELECT count(*) FROM named WHERE status = 'failed'),
      'pending',   (SELECT count(*) FROM named WHERE status = 'pending'),
      'abandoned', (SELECT count(*) FROM named WHERE status = 'abandoned'),
      'refunded',  (SELECT count(*) FROM named WHERE status = 'refunded'),
      'pro_new',     (SELECT count(*) FROM named WHERE kind = 'pro_new' AND status = 'paid'),
      'pro_renewals',(SELECT count(*) FROM named WHERE kind = 'pro_renewal' AND status = 'paid'),
      'success_rate', (SELECT CASE WHEN count(*) FILTER (WHERE status IN ('paid', 'failed', 'abandoned')) = 0 THEN NULL
                              ELSE round(100.0 * count(*) FILTER (WHERE status = 'paid')
                                   / count(*) FILTER (WHERE status IN ('paid', 'failed', 'abandoned')), 1) END
                       FROM named),
      'avg_project_payment_paise', (SELECT round(avg(amount_paise)) FROM named WHERE flow = 'project' AND status = 'paid')
    ),
    'by_kind', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'paid', paid, 'failed', failed, 'amount_paise', amt) ORDER BY amt DESC)
                  FROM (SELECT kind, count(*) FILTER (WHERE status = 'paid') paid,
                               count(*) FILTER (WHERE status IN ('failed', 'abandoned')) failed,
                               coalesce(sum(amount_paise) FILTER (WHERE status = 'paid'), 0) amt
                        FROM named GROUP BY kind) x), '[]'::jsonb),
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d, 'project_paise', pj, 'pro_paise', pr,
                                                            'paid', pd, 'failed', fl) ORDER BY d)
                 FROM (SELECT to_char((coalesce(paid_at, created_at) AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') d,
                              coalesce(sum(amount_paise) FILTER (WHERE flow = 'project' AND status = 'paid'), 0) pj,
                              coalesce(sum(amount_paise) FILTER (WHERE flow = 'pro' AND status = 'paid'), 0) pr,
                              count(*) FILTER (WHERE status = 'paid') pd,
                              count(*) FILTER (WHERE status IN ('failed', 'abandoned')) fl
                       FROM named GROUP BY 1) x), '[]'::jsonb),
    'failure_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                          FROM (SELECT coalesce(failure_reason, CASE WHEN status = 'abandoned' THEN 'Checkout not completed' ELSE 'Unknown' END) r,
                                       count(*) c
                                FROM named WHERE status IN ('failed', 'abandoned') GROUP BY 1) x), '[]'::jsonb),
    'rows', COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC)
               FROM (SELECT * FROM filtered ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_pro_subscribers — gated on 'subscribers' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_pro_subscribers(
  p_state         TEXT DEFAULT NULL,  -- active | expiring | grace | halted | expired
  p_expiring_days INT DEFAULT 7,
  p_limit         INT DEFAULT 50,
  p_offset        INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_days   INT := least(greatest(coalesce(p_expiring_days, 7), 1), 60);
  v_price  INT;
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('subscribers', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pro_price_paise INTO v_price FROM public.billing_settings LIMIT 1;

  WITH subs AS (
    SELECT s.*,
           p.name, p.email, p.role::TEXT AS role, p.last_active_at,
           CASE
             WHEN s.status IN ('active', 'authenticated')
                  AND s.current_period_end > now() + make_interval(days => v_days) THEN 'active'
             WHEN s.status IN ('active', 'authenticated') AND s.current_period_end > now() THEN 'expiring'
             WHEN s.status IN ('active', 'authenticated') AND s.grace_until > now() THEN 'grace'
             WHEN s.status IN ('halted', 'pending') THEN 'halted'
             ELSE 'expired'
           END AS state,
           (SELECT count(*) FROM public.pro_orders po WHERE po.user_id = s.user_id AND po.status = 'paid') AS payments,
           (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders po WHERE po.user_id = s.user_id AND po.status = 'paid') AS paid_paise,
           (SELECT min(paid_at) FROM public.pro_orders po WHERE po.user_id = s.user_id AND po.status = 'paid') AS first_paid_at,
           (SELECT max(paid_at) FROM public.pro_orders po WHERE po.user_id = s.user_id AND po.status = 'paid') AS last_paid_at,
           (SELECT max(n.created_at) FROM public.notifications n
             WHERE n.user_id = s.user_id AND n.type = 'reminder') AS last_reminded_at
    FROM public.subscriptions s
    JOIN public.profiles p ON p.id = s.user_id
    WHERE s.tier = 'pro'
  ),
  filtered AS (SELECT * FROM subs WHERE p_state IS NULL OR state = p_state),
  months AS (
    SELECT generate_series(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '11 months',
                           date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'), INTERVAL '1 month')::date AS m
  )
  SELECT jsonb_build_object(
    'price_paise', v_price,
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'active',   (SELECT count(*) FROM subs WHERE state IN ('active', 'expiring', 'grace')),
      'expiring', (SELECT count(*) FROM subs WHERE state = 'expiring'),
      'grace',    (SELECT count(*) FROM subs WHERE state = 'grace'),
      'halted',   (SELECT count(*) FROM subs WHERE state = 'halted'),
      'expired',  (SELECT count(*) FROM subs WHERE state = 'expired'),
      'expired_last_30d', (SELECT count(*) FROM subs WHERE state = 'expired'
                            AND current_period_end > now() - INTERVAL '30 days'),
      'mrr_paise', (SELECT count(*) FROM subs WHERE state IN ('active', 'expiring', 'grace')) * coalesce(v_price, 0),
      'lifetime_revenue_paise', (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders WHERE status = 'paid'),
      'paying_customers_ever', (SELECT count(DISTINCT user_id) FROM public.pro_orders WHERE status = 'paid'),
      'churn_rate_30d', (SELECT CASE WHEN (a + e) = 0 THEN NULL ELSE round(100.0 * e / (a + e), 1) END
                         FROM (SELECT count(*) FILTER (WHERE state IN ('active', 'expiring', 'grace')) a,
                                      count(*) FILTER (WHERE state = 'expired' AND current_period_end > now() - INTERVAL '30 days') e
                               FROM subs) x),
      -- Of customers whose FIRST paid period has run out, the share who paid again.
      'renewal_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                              ELSE round(100.0 * count(*) FILTER (WHERE n > 1) / count(*), 1) END
                       FROM (SELECT user_id, count(*) n, min(paid_at) first_paid
                             FROM public.pro_orders WHERE status = 'paid' AND user_id IS NOT NULL
                             GROUP BY user_id) c
                       WHERE c.first_paid < now() - INTERVAL '30 days')
    ),
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'month', to_char(m, 'YYYY-MM'),
                  'new', (SELECT count(*) FROM public.pro_orders po WHERE po.status = 'paid' AND NOT po.is_renewal
                           AND date_trunc('month', po.paid_at AT TIME ZONE 'Asia/Kolkata')::date = m),
                  'renewals', (SELECT count(*) FROM public.pro_orders po WHERE po.status = 'paid' AND po.is_renewal
                           AND date_trunc('month', po.paid_at AT TIME ZONE 'Asia/Kolkata')::date = m),
                  'revenue_paise', (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders po WHERE po.status = 'paid'
                           AND date_trunc('month', po.paid_at AT TIME ZONE 'Asia/Kolkata')::date = m),
                  'expired', (SELECT count(*) FROM public.subscriptions s2 WHERE s2.tier = 'pro'
                           AND s2.current_period_end < now()
                           AND date_trunc('month', s2.current_period_end AT TIME ZONE 'Asia/Kolkata')::date = m)
                ) ORDER BY m) FROM months), '[]'::jsonb),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
               'user_id', user_id, 'name', name, 'email', email, 'role', role, 'state', state,
               'status', status, 'current_period_end', current_period_end, 'grace_until', grace_until,
               'days_left', CASE WHEN current_period_end IS NULL THEN NULL
                                 ELSE floor(extract(epoch FROM current_period_end - now()) / 86400)::INT END,
               'payments', payments, 'paid_paise', paid_paise, 'first_paid_at', first_paid_at,
               'last_paid_at', last_paid_at, 'last_active_at', last_active_at, 'last_reminded_at', last_reminded_at
             ) ORDER BY current_period_end ASC NULLS LAST)
             FROM (SELECT * FROM filtered ORDER BY current_period_end ASC NULLS LAST LIMIT v_limit OFFSET v_offset) f), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_crm_leads — gated on 'leads' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_crm_leads(
  p_stage  TEXT DEFAULT NULL,
  p_kind   TEXT DEFAULT NULL,
  p_owner  UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_due    BOOLEAN DEFAULT FALSE,       -- only follow-ups due today or overdue
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_q      TEXT := nullif(lower(trim(coalesce(p_search, ''))), '');
  v_today  DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('leads', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH filtered AS (
    SELECT l.* FROM public.crm_leads l
    WHERE (p_stage IS NULL OR l.stage = p_stage)
      AND (p_kind IS NULL OR l.kind = p_kind)
      AND (p_owner IS NULL OR l.owner_id = p_owner)
      AND (NOT coalesce(p_due, FALSE) OR (l.next_follow_up IS NOT NULL AND l.next_follow_up <= v_today
                                          AND l.stage NOT IN ('signed_up', 'active', 'lost')))
      AND (v_q IS NULL
           OR lower(coalesce(l.name, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(l.company, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(l.email, '')) LIKE '%' || v_q || '%'
           OR lower(coalesce(l.handle, '')) LIKE '%' || v_q || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'summary', jsonb_build_object(
      'by_stage', COALESCE((SELECT jsonb_object_agg(stage, c)
                    FROM (SELECT stage, count(*) c FROM public.crm_leads GROUP BY 1) x), '{}'::jsonb),
      'due_today', (SELECT count(*) FROM public.crm_leads
                     WHERE next_follow_up <= v_today AND stage NOT IN ('signed_up', 'active', 'lost')),
      'converted', (SELECT count(*) FROM public.crm_leads WHERE matched_user_id IS NOT NULL),
      'conversion_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                                 ELSE round(100.0 * count(*) FILTER (WHERE matched_user_id IS NOT NULL) / count(*), 1) END
                          FROM public.crm_leads)
    ),
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'name', f.name, 'company', f.company, 'email', f.email,
        'phone', f.phone, 'handle', f.handle, 'city', f.city, 'source', f.source, 'stage', f.stage,
        'tags', f.tags, 'next_follow_up', f.next_follow_up, 'owner_id', f.owner_id, 'owner_name', o.name,
        'matched_user_id', f.matched_user_id, 'matched_at', f.matched_at,
        'created_at', f.created_at, 'updated_at', f.updated_at,
        'notes', (SELECT count(*) FROM public.crm_lead_notes n WHERE n.lead_id = f.id),
        'last_note', (SELECT jsonb_build_object('note', n.note, 'kind', n.kind, 'created_at', n.created_at)
                      FROM public.crm_lead_notes n WHERE n.lead_id = f.id ORDER BY n.created_at DESC LIMIT 1)
      ) ORDER BY f.next_follow_up ASC NULLS LAST, f.updated_at DESC)
      FROM (SELECT * FROM filtered
            ORDER BY next_follow_up ASC NULLS LAST, updated_at DESC
            LIMIT v_limit OFFSET v_offset) f
      LEFT JOIN public.profiles o ON o.id = f.owner_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_search_analytics — gated on 'marketplace' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_search_analytics(p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fromd DATE := coalesce(p_from, current_date - 29);
  v_tod   DATE := coalesce(p_to, current_date);
  v_from  TIMESTAMPTZ := (v_fromd::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to    TIMESTAMPTZ := ((v_tod + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_result JSONB;
BEGIN
  IF NOT public.admin_has_permission('marketplace', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH s AS (
    SELECT * FROM public.search_events WHERE created_at >= v_from AND created_at < v_to
  )
  SELECT jsonb_build_object(
    'history_starts', (SELECT min(created_at) FROM public.search_events),
    'totals', jsonb_build_object(
      'searches', (SELECT count(*) FROM s),
      'searchers', (SELECT count(DISTINCT user_id) FROM s),
      'zero_results', (SELECT count(*) FROM s WHERE result_count = 0),
      'zero_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                          ELSE round(100.0 * count(*) FILTER (WHERE result_count = 0) / count(*), 1) END FROM s),
      'median_results', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY result_count)::numeric, 1) FROM s),
      -- "Local" = the searcher asked for their own city.
      'local_searches', (SELECT count(*) FROM s WHERE location IS NOT NULL AND searcher_city IS NOT NULL
                           AND lower(location) = lower(searcher_city)),
      'global_searches', (SELECT count(*) FROM s WHERE location IS NULL)
    ),
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
                          'searches', c, 'zero', z) ORDER BY d)
                 FROM (SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::DATE d, count(*) c,
                              count(*) FILTER (WHERE result_count = 0) z
                       FROM s GROUP BY 1) x), '[]'::jsonb),
    'zero_result_filters', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                        'niche', niche, 'industry', industry, 'location', location, 'count', c) ORDER BY c DESC)
                 FROM (SELECT niche, industry, location, count(*) c FROM s WHERE result_count = 0
                       GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20) x), '[]'::jsonb),
    'top_niches', COALESCE((SELECT jsonb_agg(jsonb_build_object('niche', niche, 'searches', c,
                        'creators_available', (SELECT count(*) FROM public.influencer_profiles ip
                                               JOIN public.profiles p ON p.id = ip.user_id AND p.role = 'influencer'
                                               WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(
                                                      CASE WHEN jsonb_typeof(ip.niche) = 'array' THEN ip.niche ELSE '[]'::jsonb END) n
                                                     WHERE lower(n) = lower(x.niche)))) ORDER BY c DESC)
                 FROM (SELECT niche, count(*) c FROM s WHERE niche IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x), '[]'::jsonb),
    'top_locations', COALESCE((SELECT jsonb_agg(jsonb_build_object('location', location, 'searches', c) ORDER BY c DESC)
                 FROM (SELECT location, count(*) c FROM s WHERE location IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x), '[]'::jsonb),
    'by_surface', COALESCE((SELECT jsonb_object_agg(surface, c)
                 FROM (SELECT surface, count(*) c FROM s GROUP BY 1) x), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- admin_report_dataset — gated on 'report_builder' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_report_dataset(
  p_dataset TEXT,
  p_from    DATE,
  p_to      DATE,
  p_limit   INT DEFAULT 500,
  p_offset  INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  INT := least(greatest(coalesce(p_limit, 500), 1), 5000);
  v_offset INT := greatest(coalesce(p_offset, 0), 0);
  v_from   TIMESTAMPTZ := (coalesce(p_from, current_date - 29)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to     TIMESTAMPTZ := ((coalesce(p_to, current_date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_super  BOOLEAN := public.caller_is_super_admin();
  v_rows   JSONB;
  v_total  BIGINT;
BEGIN
  IF NOT public.admin_has_permission('report_builder', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_dataset = 'users' THEN
    SELECT count(*) INTO v_total FROM public.profiles p
      WHERE p.role::TEXT <> 'admin' AND p.created_at >= v_from AND p.created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'email', p.email,
        'phone', CASE WHEN v_super THEN p.phone ELSE public.mask_phone(p.phone) END,
        'role', p.role, 'city', COALESCE(ip.city, bp.city, p.location),
        'stage', public.user_lifecycle_stage(p.id, p.role::TEXT),
        'tier', public.current_tier(p.id)::TEXT,
        'verification_status', p.verification_status, 'approval_status', bp.approval_status,
        'created_at', p.created_at, 'last_active_at', p.last_active_at) ORDER BY p.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.profiles
            WHERE role::TEXT <> 'admin' AND created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) p
      LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
      LEFT JOIN public.business_profiles bp ON bp.user_id = p.id;

  ELSIF p_dataset = 'projects' THEN
    SELECT count(*) INTO v_total FROM public.campaign_projects WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'status', c.status, 'stage', c.current_stage,
        'owner', ow.name, 'counterparty', cn.name, 'budget', c.budget,
        'created_at', c.created_at, 'completed_at', c.completed_at, 'cancelled_at', c.cancelled_at,
        'paid_paise', (SELECT coalesce(sum(amount), 0) FROM public.project_payments pp
                        WHERE pp.project_id = c.id AND pp.status = 'paid')) ORDER BY c.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.campaign_projects WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) c
      LEFT JOIN public.profiles ow ON ow.id = c.owner_user_id
      LEFT JOIN public.profiles cn ON cn.id = c.counterparty_user_id;

  ELSIF p_dataset = 'payments' THEN
    SELECT count(*) INTO v_total FROM public.project_payments WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', pp.id, 'project_id', pp.project_id, 'kind', pp.stage_key, 'status', pp.status,
        'amount_paise', pp.amount, 'currency', pp.currency, 'payer', pr.name,
        'razorpay_order_id', pp.razorpay_order_id, 'razorpay_payment_id', pp.razorpay_payment_id,
        'failure_reason', pp.failure_reason,
        'created_at', pp.created_at, 'paid_at', pp.paid_at) ORDER BY pp.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.project_payments WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) pp
      LEFT JOIN public.profiles pr ON pr.id = pp.payer_id;

  ELSIF p_dataset = 'subscriptions' THEN
    SELECT count(*) INTO v_total FROM public.pro_orders WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'order_id', po.razorpay_order_id, 'user', p.name, 'email', p.email,
        'status', po.status, 'is_renewal', po.is_renewal, 'amount_paise', po.amount_paise,
        'failure_reason', po.failure_reason,
        'created_at', po.created_at, 'paid_at', po.paid_at) ORDER BY po.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.pro_orders WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) po
      LEFT JOIN public.profiles p ON p.id = po.user_id;

  ELSIF p_dataset = 'requests' THEN
    SELECT count(*) INTO v_total FROM public.collab_requests WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'from', fp.name, 'to', tp.name, 'status', r.status, 'budget', r.budget,
        'created_at', r.created_at, 'updated_at', r.updated_at,
        'response_hours', CASE WHEN r.status::TEXT <> 'pending'
                               THEN round((extract(epoch FROM r.updated_at - r.created_at) / 3600)::numeric, 1) END)
        ORDER BY r.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.collab_requests WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) r
      LEFT JOIN public.profiles fp ON fp.id = r.from_user_id
      LEFT JOIN public.profiles tp ON tp.id = r.to_user_id;

  ELSIF p_dataset = 'campaigns' THEN
    SELECT count(*) INTO v_total FROM public.campaigns WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'business', p.name, 'status', c.status,
        'budget_min', c.budget_min, 'budget_max', c.budget_max, 'location', c.location,
        'applications', (SELECT count(*) FROM public.campaign_applications a WHERE a.campaign_id = c.id),
        'created_at', c.created_at, 'published_at', c.published_at) ORDER BY c.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.campaigns WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) c
      LEFT JOIN public.profiles p ON p.id = c.business_user_id;

  ELSIF p_dataset = 'notifications' THEN
    SELECT count(*) INTO v_total FROM public.notifications WHERE created_at >= v_from AND created_at < v_to;
    SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'user', p.name, 'role', p.role, 'type', n.type, 'title', n.title,
        'created_at', n.created_at, 'read_at', n.read_at) ORDER BY n.created_at DESC)
      INTO v_rows
      FROM (SELECT * FROM public.notifications WHERE created_at >= v_from AND created_at < v_to
            ORDER BY created_at DESC LIMIT v_limit OFFSET v_offset) n
      LEFT JOIN public.profiles p ON p.id = n.user_id;

  ELSIF p_dataset = 'deleted_accounts' THEN
    SELECT count(*) INTO v_total FROM public.deleted_accounts WHERE deleted_at >= v_from AND deleted_at < v_to;
    SELECT jsonb_agg(to_jsonb(d) - 'email_hash' - 'phone_hash' ORDER BY d.deleted_at DESC) INTO v_rows
      FROM (SELECT * FROM public.deleted_accounts WHERE deleted_at >= v_from AND deleted_at < v_to
            ORDER BY deleted_at DESC LIMIT v_limit OFFSET v_offset) d;

  ELSE
    RAISE EXCEPTION 'unknown dataset: %', p_dataset;
  END IF;

  RETURN jsonb_build_object('dataset', p_dataset, 'total', v_total, 'rows', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- admin_creator_applications_report — gated on 'early_access' (view), was is_admin() only
CREATE OR REPLACE FUNCTION public.admin_creator_applications_report(
  p_search TEXT DEFAULT '',
  p_follower_tier TEXT DEFAULT '',
  p_creator_type TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_10k_plus INT;
  v_experienced INT;
  v_latest TIMESTAMPTZ;
  v_search TEXT := trim(coalesce(p_search, ''));
  v_tier TEXT := trim(coalesce(p_follower_tier, ''));
  v_type TEXT := trim(coalesce(p_creator_type, ''));
BEGIN
  IF NOT public.admin_has_permission('early_access', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Count in SQL per AGENTS.md rule (never count in Node)
  SELECT count(*),
         count(*) FILTER (WHERE follower_tier IN ('10K – 50K', '50K – 100K', '100K+')),
         count(*) FILTER (WHERE brand_experience ILIKE '%yes%'),
         max(created_at)
    INTO v_total, v_10k_plus, v_experienced, v_latest
    FROM public.creator_join_applications;

  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'over_10k', coalesce(v_10k_plus, 0),
      'experienced', coalesce(v_experienced, 0),
      'latest_at', v_latest
    ),
    'rows', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'application_number', application_number,
            'name', name,
            'email', email,
            'phone', phone,
            'instagram_handle', instagram_handle,
            'creator_type', creator_type,
            'follower_tier', follower_tier,
            'content_niches', content_niches,
            'brand_experience', brand_experience,
            'biggest_challenge', biggest_challenge,
            'status', status,
            'metadata', metadata,
            'created_at', created_at
          )
          ORDER BY created_at DESC
        )
        FROM (
          SELECT *
            FROM public.creator_join_applications
           WHERE (v_search = '' OR (
                    name ILIKE '%' || v_search || '%' OR
                    email ILIKE '%' || v_search || '%' OR
                    phone ILIKE '%' || v_search || '%' OR
                    instagram_handle ILIKE '%' || v_search || '%'
                 ))
             AND (v_tier = '' OR follower_tier = v_tier)
             AND (v_type = '' OR creator_type = v_type)
           ORDER BY created_at DESC
           LIMIT LEAST(GREATEST(p_limit, 1), 200)
          OFFSET GREATEST(p_offset, 0)
        ) filtered
      ),
      '[]'::jsonb
    )
  );
END;
$$;


