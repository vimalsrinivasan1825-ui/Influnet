-- Migration 160: CRM leads, search logging (match analytics), report builder
--
--   crm_leads / crm_lead_notes  brands and creators the team sources offline,
--                               before they have an account
--   search_events               structured Discover searches — the ONLY way to
--                               answer "what are brands looking for and not
--                               finding". No free text is stored (it can carry
--                               personal data); only whitelisted filters.
--   saved_reports               a named dataset + filters for the report builder
--   admin_report_dataset()      whitelisted datasets, never client SQL

-- ── 1. CRM leads ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL CHECK (kind IN ('creator', 'business')),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  company       TEXT,
  email         TEXT,
  phone         TEXT,
  handle        TEXT,
  city          TEXT,
  source        TEXT,                    -- event | referral | instagram | cold_call | inbound | other
  stage         TEXT NOT NULL DEFAULT 'new'
                  CHECK (stage IN ('new', 'contacted', 'interested', 'invited', 'signed_up', 'active', 'lost')),
  owner_id      UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  next_follow_up DATE,
  -- Set when the lead signs up: matched on normalised email/phone.
  matched_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  matched_at    TIMESTAMPTZ,
  created_by    UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_leads_stage_idx ON public.crm_leads (stage, next_follow_up);
CREATE INDEX IF NOT EXISTS crm_leads_email_idx ON public.crm_leads (lower(email)) WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER crm_leads_updated_at BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_lead_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES public.crm_leads (id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  note       TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
  kind       TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'call', 'email', 'meeting', 'stage_change')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lead_notes_lead_idx ON public.crm_lead_notes (lead_id, created_at DESC);

ALTER TABLE public.crm_leads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_leads, public.crm_lead_notes FROM anon, authenticated;

-- Link a lead to an account once that person signs up. Called after signup and
-- on demand from the admin list.
CREATE OR REPLACE FUNCTION public.match_crm_leads()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INT;
BEGIN
  UPDATE public.crm_leads l
     SET matched_user_id = p.id,
         matched_at = now(),
         stage = CASE WHEN l.stage IN ('new', 'contacted', 'interested', 'invited') THEN 'signed_up' ELSE l.stage END
    FROM public.profiles p
   WHERE l.matched_user_id IS NULL
     AND ((l.email IS NOT NULL AND lower(l.email) = lower(p.email))
       OR (l.phone IS NOT NULL AND p.phone IS NOT NULL
           AND right(regexp_replace(l.phone, '\D', '', 'g'), 10) = right(regexp_replace(p.phone, '\D', '', 'g'), 10)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.match_crm_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_crm_leads() TO service_role;

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_crm_leads(TEXT, TEXT, UUID, TEXT, BOOLEAN, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_crm_leads(TEXT, TEXT, UUID, TEXT, BOOLEAN, INT, INT) TO authenticated;

-- ── 2. Search events (match analytics) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  role          TEXT,
  surface       TEXT NOT NULL CHECK (surface IN ('discover', 'campaigns', 'command_palette')),
  -- Whitelisted structured filters ONLY. The typed query itself is never stored:
  -- it routinely contains a person's name or handle.
  has_query     BOOLEAN NOT NULL DEFAULT FALSE,
  query_length  SMALLINT,
  niche         TEXT,
  industry      TEXT,
  location      TEXT,
  searcher_city TEXT,
  result_count  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_events_created_idx ON public.search_events (created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_zero_idx ON public.search_events (created_at DESC) WHERE result_count = 0;

ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_search_event(
  p_surface  TEXT,
  p_has_query BOOLEAN,
  p_query_length INT,
  p_niche    TEXT,
  p_industry TEXT,
  p_location TEXT,
  p_result_count INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_surface NOT IN ('discover', 'campaigns', 'command_palette') THEN
    RETURN;
  END IF;
  INSERT INTO public.search_events (user_id, role, surface, has_query, query_length,
                                    niche, industry, location, searcher_city, result_count)
  SELECT v_uid, p.role::TEXT, p_surface, coalesce(p_has_query, FALSE),
         least(coalesce(p_query_length, 0), 200),
         left(p_niche, 60), left(p_industry, 60), left(p_location, 80),
         COALESCE(ip.city, bp.city, p.location),
         greatest(coalesce(p_result_count, 0), 0)
  FROM public.profiles p
  LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
  LEFT JOIN public.business_profiles  bp ON bp.user_id = p.id
  WHERE p.id = v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.log_search_event(TEXT, BOOLEAN, INT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_search_event(TEXT, BOOLEAN, INT, TEXT, TEXT, TEXT, INT) TO authenticated;

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_search_analytics(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_analytics(DATE, DATE) TO authenticated;

-- ── 3. Report builder ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  dataset    TEXT NOT NULL,
  filters    JSONB NOT NULL DEFAULT '{}'::jsonb,
  columns    TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_reports FROM anon, authenticated;

DROP TRIGGER IF EXISTS saved_reports_updated_at ON public.saved_reports;
CREATE TRIGGER saved_reports_updated_at BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Whitelisted datasets. There is deliberately NO free-form SQL: the client picks
-- a dataset name and a date range, nothing more.
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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
REVOKE ALL ON FUNCTION public.admin_report_dataset(TEXT, DATE, DATE, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_report_dataset(TEXT, DATE, DATE, INT, INT) TO authenticated;
