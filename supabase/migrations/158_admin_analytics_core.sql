-- Migration 158: admin analytics — founder dashboard, daily metrics, product funnels
--
-- Everything here is DERIVED from product tables plus user_daily_activity (152).
-- No new writers, so a feature that forgets to emit an event cannot make these
-- lie (same rule as 073 / 099).
--
-- Conventions in every function below: is_admin() first, IST day boundaries,
-- clamped windows, STABLE SECURITY DEFINER, no grant to anon.

-- ── Internal: one period's KPIs ────────────────────────────────────────────
-- Not granted to anyone: called twice by admin_founder_dashboard (this period
-- and the one before it) so every tile can show a delta.
CREATE OR REPLACE FUNCTION public.admin_period_kpis(v_from TIMESTAMPTZ, v_to TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'signups',            (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to AND role <> 'admin'),
    'signups_creators',   (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to AND role = 'influencer'),
    'signups_businesses', (SELECT count(*) FROM public.profiles WHERE created_at >= v_from AND created_at < v_to AND role = 'business_owner'),
    'verified_creators',  (SELECT count(*) FROM public.profiles WHERE verified_at >= v_from AND verified_at < v_to AND role = 'influencer'),
    'active_users',       (SELECT count(DISTINCT user_id) FROM public.user_daily_activity
                            WHERE day_ist >= (v_from AT TIME ZONE 'Asia/Kolkata')::DATE
                              AND day_ist <  (v_to   AT TIME ZONE 'Asia/Kolkata')::DATE),
    'requests_sent',      (SELECT count(*) FROM public.collab_requests WHERE created_at >= v_from AND created_at < v_to),
    'requests_accepted',  (SELECT count(*) FROM public.collab_requests
                            WHERE status = 'accepted' AND updated_at >= v_from AND updated_at < v_to),
    'projects_created',   (SELECT count(*) FROM public.campaign_projects WHERE created_at >= v_from AND created_at < v_to),
    'projects_completed', (SELECT count(*) FROM public.campaign_projects WHERE completed_at >= v_from AND completed_at < v_to),
    'projects_cancelled', (SELECT count(*) FROM public.campaign_projects WHERE cancelled_at >= v_from AND cancelled_at < v_to),
    'campaigns_published',(SELECT count(*) FROM public.campaigns WHERE published_at >= v_from AND published_at < v_to),
    'applications',       (SELECT count(*) FROM public.campaign_applications WHERE created_at >= v_from AND created_at < v_to),
    'gmv_paise',          (SELECT coalesce(sum(amount), 0) FROM public.project_payments
                            WHERE status = 'paid' AND paid_at >= v_from AND paid_at < v_to),
    'payments_paid',      (SELECT count(*) FROM public.project_payments
                            WHERE status = 'paid' AND paid_at >= v_from AND paid_at < v_to),
    'payments_failed',    (SELECT count(*) FROM public.project_payments
                            WHERE status = 'failed' AND created_at >= v_from AND created_at < v_to),
    'pro_revenue_paise',  (SELECT coalesce(sum(amount_paise), 0) FROM public.pro_orders
                            WHERE status = 'paid' AND paid_at >= v_from AND paid_at < v_to),
    'pro_payments',       (SELECT count(*) FROM public.pro_orders WHERE status = 'paid' AND paid_at >= v_from AND paid_at < v_to),
    'tickets',            (SELECT count(*) FROM public.support_tickets WHERE created_at >= v_from AND created_at < v_to),
    'reports',            (SELECT count(*) FROM public.user_reports WHERE created_at >= v_from AND created_at < v_to),
    'deletions',          (SELECT count(*) FROM public.deleted_accounts WHERE deleted_at >= v_from AND deleted_at < v_to),
    -- Liquidity: of the requests raised in this window that got an answer,
    -- how many were answered within 48 hours.
    'answered_within_48h_pct', (
      SELECT CASE WHEN count(*) = 0 THEN NULL
                  ELSE round(100.0 * count(*) FILTER (WHERE updated_at - created_at < INTERVAL '48 hours') / count(*), 1) END
      FROM public.collab_requests
      WHERE created_at >= v_from AND created_at < v_to AND status <> 'pending')
  );
$$;
REVOKE ALL ON FUNCTION public.admin_period_kpis(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ── 1. Founder dashboard ───────────────────────────────────────────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_founder_dashboard(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_founder_dashboard(DATE, DATE) TO authenticated;

-- ── 2. Daily metrics (users + marketplace) ─────────────────────────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_daily_metrics(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_daily_metrics(DATE, DATE) TO authenticated;

-- ── 3. Product analytics: both funnels, cohorts, stage drop-off ────────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_product_analytics(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_product_analytics(INT) TO authenticated;
