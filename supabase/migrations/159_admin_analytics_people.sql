-- Migration 159: admin analytics — customer tracking, incomplete signups,
-- app activity + heatmap, marketplace and engagement reports.
--
-- Companion to 158. Same rules: is_admin() first, IST days, clamped windows,
-- STABLE SECURITY DEFINER, nothing granted to anon.

-- ── 1. Lifecycle stage (shared by the CRM list and its summary) ────────────
-- One label per user, in order of progress, computed from the rows that already
-- record each fact.
CREATE OR REPLACE FUNCTION public.user_lifecycle_stage(p_user UUID, p_role TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role = 'influencer' THEN CASE
      WHEN (SELECT count(*) FROM public.campaign_projects c
             WHERE c.status = 'completed' AND (c.owner_user_id = p_user OR c.counterparty_user_id = p_user)) > 1 THEN 'repeat'
      WHEN EXISTS (SELECT 1 FROM public.campaign_projects c
                    WHERE c.status = 'completed' AND (c.owner_user_id = p_user OR c.counterparty_user_id = p_user)) THEN 'completed_project'
      WHEN EXISTS (SELECT 1 FROM public.campaign_projects c
                    WHERE c.owner_user_id = p_user OR c.counterparty_user_id = p_user) THEN 'in_project'
      WHEN EXISTS (SELECT 1 FROM public.collab_requests r
                    WHERE r.to_user_id = p_user OR r.from_user_id = p_user) THEN 'in_conversation'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user AND p.verification_status = 'verified') THEN 'verified'
      WHEN EXISTS (SELECT 1 FROM public.social_account_claims s WHERE s.user_id = p_user AND s.status = 'verified') THEN 'ownership_confirmed'
      WHEN EXISTS (SELECT 1 FROM public.influencer_profiles i
                    WHERE i.user_id = p_user AND coalesce(i.instagram_handle, i.youtube_handle, '') <> '') THEN 'profile_started'
      ELSE 'signed_up' END
    ELSE CASE
      WHEN (SELECT count(*) FROM public.campaign_projects c
             WHERE c.owner_user_id = p_user OR c.counterparty_user_id = p_user) > 1 THEN 'repeat'
      WHEN EXISTS (SELECT 1 FROM public.project_payments pp WHERE pp.payer_id = p_user AND pp.status = 'paid') THEN 'paying'
      WHEN EXISTS (SELECT 1 FROM public.campaign_projects c
                    WHERE c.owner_user_id = p_user OR c.counterparty_user_id = p_user) THEN 'in_project'
      WHEN EXISTS (SELECT 1 FROM public.collab_requests r WHERE r.from_user_id = p_user)
        OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.business_user_id = p_user) THEN 'reached_out'
      WHEN EXISTS (SELECT 1 FROM public.creator_profile_views v WHERE v.business_id = p_user)
        OR EXISTS (SELECT 1 FROM public.saved_items s WHERE s.user_id = p_user) THEN 'browsed'
      WHEN EXISTS (SELECT 1 FROM public.business_profiles b WHERE b.user_id = p_user AND b.approval_status = 'approved') THEN 'approved'
      ELSE 'signed_up' END
  END;
$$;
REVOKE ALL ON FUNCTION public.user_lifecycle_stage(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_lifecycle_stage(UUID, TEXT) TO authenticated;

-- ── 2. Customer tracking (the CRM list) ────────────────────────────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_customer_tracking(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_customer_tracking(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, INT) TO authenticated;

-- ── 3. Incomplete signups ──────────────────────────────────────────────────
-- Buckets an operator can act on. `orphan_auth` reads auth.users, which is why
-- this is SECURITY DEFINER rather than a view.
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_incomplete_signups(TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_incomplete_signups(TEXT, INT, INT) TO authenticated;

-- ── 4. App activity + weekday × hour heatmap ───────────────────────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_app_activity(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_app_activity(DATE, DATE) TO authenticated;

-- ── 5. Marketplace: campaigns, projects, requests ──────────────────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_marketplace(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_marketplace(DATE, DATE) TO authenticated;

-- ── 6. Engagement features (views, clicks, saves, reveals, notifications) ──
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_engagement(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_engagement(DATE, DATE) TO authenticated;
