-- Migration 197: founder dashboard additions (G15)
--
-- docs/operations/ADMIN_AND_OBSERVABILITY_GAPS_2026-10-06.md §G15: top
-- niches/categories by projects and GMV, top-spending brands, campaign
-- success rate, creator earnings distribution, and payment-failure rate as a
-- trend rather than a lifetime count. Each is a new block inside the existing
-- admin_founder_dashboard() JSON — no new system, no new table.
--
-- CREATE OR REPLACE FUNCTION needs the full body, so this reissues
-- admin_founder_dashboard() in full. Every line outside the new blocks below
-- is unchanged from migration 196 (verified by diffing the two, excluding the
-- new/changed blocks, before writing this file).

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
    -- G15: top niches by GMV. Keys off influencer_profiles.niche (free-text
    -- jsonb array) joined through campaign_projects' creator side — there is
    -- no shared taxonomy with campaigns.categories, so this is the creator
    -- side of the market, not the brand brief side.
    'top_niches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('niche', niche, 'projects', projects, 'gmv_paise', gmv_paise) ORDER BY gmv_paise DESC)
      FROM (
        SELECT n.niche AS niche,
               count(DISTINCT p.id) AS projects,
               coalesce(sum(pay.amount), 0) AS gmv_paise
        FROM public.influencer_profiles ip
        CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(ip.niche, '[]'::jsonb)) AS n(niche)
        JOIN public.campaign_projects p ON p.counterparty_user_id = ip.user_id
        LEFT JOIN public.project_payments pay ON pay.project_id = p.id AND pay.status = 'paid'
        GROUP BY n.niche
        ORDER BY gmv_paise DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    -- G15: top-spending brands, lifetime (not window-scoped — a brand's spend
    -- accumulates across many short windows, and "top this week" is mostly noise).
    'top_brands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('business_user_id', business_user_id, 'company_name', company_name, 'projects', projects, 'gmv_paise', gmv_paise) ORDER BY gmv_paise DESC)
      FROM (
        SELECT p.owner_user_id AS business_user_id,
               bp.company_name,
               count(DISTINCT p.id) AS projects,
               coalesce(sum(pay.amount), 0) AS gmv_paise
        FROM public.campaign_projects p
        JOIN public.business_profiles bp ON bp.user_id = p.owner_user_id
        LEFT JOIN public.project_payments pay ON pay.project_id = p.id AND pay.status = 'paid'
        GROUP BY p.owner_user_id, bp.company_name
        HAVING coalesce(sum(pay.amount), 0) > 0
        ORDER BY gmv_paise DESC
        LIMIT 10
      ) t
    ), '[]'::jsonb),
    -- G15: campaign success rate. There is no FK from campaign_projects back
    -- to the campaign that produced it (accept_campaign_application only
    -- copies the campaign title into collab_requests.message) — same
    -- approximation style as request_to_project_pct above: a campaign
    -- "succeeded" if any of its ACCEPTED applicants ended up with a COMPLETED
    -- project against this same brand, started after that application
    -- resolved. Not a guaranteed 1:1 match if the same brand/creator pair runs
    -- concurrent threads, but the best available signal without a real FK.
    'campaign_success', (
      SELECT jsonb_build_object(
        'published', total,
        'with_completed_project', won,
        'success_rate_pct', CASE WHEN total = 0 THEN NULL ELSE round(100.0 * won / total, 1) END
      )
      FROM (
        SELECT count(*) AS total,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM public.campaign_applications a
                 JOIN public.campaign_projects p
                   ON p.owner_user_id = c.business_user_id
                  AND p.counterparty_user_id = a.creator_user_id
                  AND p.status = 'completed'
                  AND p.created_at >= a.resolved_at
                 WHERE a.campaign_id = c.id AND a.status = 'accepted'
               )) AS won
        FROM public.campaigns c WHERE c.published_at IS NOT NULL
      ) x
    ),
    -- G15: creator earnings distribution, lifetime paid amount bucketed.
    'creator_earnings_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'creators', creators) ORDER BY ord)
      FROM (
        SELECT
          CASE
            WHEN earned_paise < 500000   THEN '< ₹5,000'
            WHEN earned_paise < 2000000  THEN '₹5,000–20,000'
            WHEN earned_paise < 5000000  THEN '₹20,000–50,000'
            WHEN earned_paise < 10000000 THEN '₹50,000–1,00,000'
            ELSE '₹1,00,000+'
          END AS bucket,
          CASE
            WHEN earned_paise < 500000   THEN 0
            WHEN earned_paise < 2000000  THEN 1
            WHEN earned_paise < 5000000  THEN 2
            WHEN earned_paise < 10000000 THEN 3
            ELSE 4
          END AS ord,
          count(*) AS creators
        FROM (
          SELECT p.counterparty_user_id, coalesce(sum(pay.amount), 0) AS earned_paise
          FROM public.campaign_projects p
          JOIN public.project_payments pay ON pay.project_id = p.id AND pay.status = 'paid'
          GROUP BY p.counterparty_user_id
        ) e
        GROUP BY bucket, ord
      ) b
    ), '[]'::jsonb),
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
                     WHERE po.status = 'paid' AND (po.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        -- G15: payment-failure rate as a trend, not just a lifetime count.
        -- 'paid' is bucketed by paid_at (settlement day) and 'failed' by
        -- created_at (a failed payment never gets paid_at) — same bucketing
        -- choice admin_period_kpis already makes for payments_failed above.
        'payments_paid_count', (SELECT count(*) FROM public.project_payments pp
                     WHERE pp.status = 'paid' AND (pp.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'payments_failed_count', (SELECT count(*) FROM public.project_payments pp
                     WHERE pp.status = 'failed' AND (pp.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day),
        'payment_failure_rate_pct', (
          SELECT CASE WHEN (paid_n + failed_n) = 0 THEN NULL ELSE round(100.0 * failed_n / (paid_n + failed_n), 1) END
          FROM (
            SELECT
              (SELECT count(*) FROM public.project_payments pp WHERE pp.status = 'paid' AND (pp.paid_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day) AS paid_n,
              (SELECT count(*) FROM public.project_payments pp WHERE pp.status = 'failed' AND (pp.created_at AT TIME ZONE 'Asia/Kolkata')::DATE = d.day) AS failed_n
          ) c
        )
      ) ORDER BY d.day)
      FROM (SELECT generate_series((v_from AT TIME ZONE 'Asia/Kolkata')::DATE,
                                   ((v_to - INTERVAL '1 second') AT TIME ZONE 'Asia/Kolkata')::DATE,
                                   INTERVAL '1 day')::DATE AS day) d
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
