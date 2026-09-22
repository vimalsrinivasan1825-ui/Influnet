-- Migration 153: deleted-account tombstones
--
-- WHY: account deletion is auth.admin.deleteUser(), which cascades every row
-- that belongs to the user away. Self-service deletions (DELETE /api/profile)
-- left NO trace at all; admin deletions left only an audit-log line. The admin
-- "Deleted users" screen needs to answer: how many leave, who (role), why, and
-- what they had done on the platform before leaving.
--
-- PRIVACY (India DPDP Act 2023): this table deliberately stores NO name, email,
-- phone or handle in clear. It keeps the user id (already meaningless once the
-- account is gone), role, dates, a reason, aggregate counts, and a keyed hash of
-- email/phone computed in the app (HMAC, secret never in the database) so a
-- future re-signup can be recognised without keeping the address itself.
--
-- WRITE ORDER: the app calls record_account_deletion() BEFORE deleteUser(), and
-- refuses to delete if the tombstone cannot be written — after the cascade there
-- is nothing left to summarise.

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  user_id       UUID PRIMARY KEY,          -- no FK: the profile is gone by design
  role          TEXT NOT NULL,
  signed_up_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by    UUID,                      -- = user_id for self-service
  deleted_via   TEXT NOT NULL CHECK (deleted_via IN ('self_web', 'self_mobile', 'admin')),
  reason_code   TEXT CHECK (reason_code IN (
                  'not_useful', 'privacy', 'duplicate', 'found_alternative',
                  'too_expensive', 'bad_experience', 'admin_action', 'other')),
  reason_text   TEXT CHECK (char_length(reason_text) <= 500),
  email_hash    TEXT,
  phone_hash    TEXT,
  city          TEXT,
  last_active_at TIMESTAMPTZ,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS deleted_accounts_deleted_at_idx ON public.deleted_accounts (deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_accounts_email_hash_idx ON public.deleted_accounts (email_hash) WHERE email_hash IS NOT NULL;

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM anon, authenticated;

-- ── record_account_deletion() — service role only ──────────────────────────
CREATE OR REPLACE FUNCTION public.record_account_deletion(
  p_user_id     UUID,
  p_via         TEXT,
  p_deleted_by  UUID,
  p_reason_code TEXT,
  p_reason_text TEXT,
  p_email_hash  TEXT,
  p_phone_hash  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   TEXT;
  v_signup TIMESTAMPTZ;
  v_city   TEXT;
  v_active TIMESTAMPTZ;
  v_stats  JSONB;
BEGIN
  SELECT p.role::TEXT, p.created_at, p.last_active_at,
         COALESCE(ip.city, bp.city, p.location)
    INTO v_role, v_signup, v_active, v_city
  FROM public.profiles p
  LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
  LEFT JOIN public.business_profiles  bp ON bp.user_id = p.id
  WHERE p.id = p_user_id;

  SELECT jsonb_build_object(
    'projects',        (SELECT count(*) FROM public.campaign_projects cp
                         WHERE cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id),
    'projects_completed', (SELECT count(*) FROM public.campaign_projects cp
                         WHERE cp.status = 'completed'
                           AND (cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id)),
    'projects_cancelled', (SELECT count(*) FROM public.campaign_projects cp
                         WHERE cp.status = 'cancelled'
                           AND (cp.owner_user_id = p_user_id OR cp.counterparty_user_id = p_user_id)),
    'requests_sent',   (SELECT count(*) FROM public.collab_requests WHERE from_user_id = p_user_id),
    'requests_received', (SELECT count(*) FROM public.collab_requests WHERE to_user_id = p_user_id),
    'payments_paid',   (SELECT count(*) FROM public.project_payments WHERE payer_id = p_user_id AND status = 'paid'),
    'gmv_paise',       (SELECT COALESCE(sum(amount), 0) FROM public.project_payments WHERE payer_id = p_user_id AND status = 'paid'),
    'pro_payments',    (SELECT count(*) FROM public.billing_events
                         WHERE user_id = p_user_id AND kind IN ('payment.captured', 'order.paid')),
    'was_pro',         EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id AND tier = 'pro'),
    'verified',        EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND verification_status = 'verified'),
    'business_approved', EXISTS (SELECT 1 FROM public.business_profiles WHERE user_id = p_user_id AND approval_status = 'approved'),
    'support_tickets', (SELECT count(*) FROM public.support_tickets WHERE user_id = p_user_id),
    'reports_against', (SELECT count(*) FROM public.user_reports WHERE reported_id = p_user_id)
  ) INTO v_stats;

  INSERT INTO public.deleted_accounts AS d (
    user_id, role, signed_up_at, deleted_by, deleted_via, reason_code, reason_text,
    email_hash, phone_hash, city, last_active_at, stats
  ) VALUES (
    p_user_id, COALESCE(v_role, 'orphan'), v_signup, p_deleted_by,
    CASE WHEN p_via IN ('self_web', 'self_mobile', 'admin') THEN p_via ELSE 'self_web' END,
    CASE WHEN p_reason_code IN ('not_useful', 'privacy', 'duplicate', 'found_alternative',
                                'too_expensive', 'bad_experience', 'admin_action', 'other')
         THEN p_reason_code ELSE NULL END,
    left(nullif(trim(p_reason_text), ''), 500),
    p_email_hash, p_phone_hash, v_city, v_active, v_stats
  )
  -- A retry after a failed deleteUser() overwrites the first attempt.
  ON CONFLICT (user_id) DO UPDATE SET
    deleted_at  = now(),
    deleted_by  = EXCLUDED.deleted_by,
    deleted_via = EXCLUDED.deleted_via,
    reason_code = COALESCE(EXCLUDED.reason_code, d.reason_code),
    reason_text = COALESCE(EXCLUDED.reason_text, d.reason_text),
    stats       = EXCLUDED.stats;

  RETURN jsonb_build_object('recorded', TRUE, 'role', COALESCE(v_role, 'orphan'));
END;
$$;

REVOKE ALL ON FUNCTION public.record_account_deletion(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_deletion(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ── admin_deleted_accounts() — list + summary for the admin screen ─────────
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.admin_deleted_accounts(DATE, DATE, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_deleted_accounts(DATE, DATE, TEXT, TEXT, INT, INT) TO authenticated;
