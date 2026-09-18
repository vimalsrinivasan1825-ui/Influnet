-- Migration 155: payments ledger, Pro orders, subscriber analytics
--
-- WHY (docs/product/ADMIN_CRM_ANALYSIS_2026-09-17.md §4.D):
--   • A Pro checkout that was started but never paid left NO row anywhere —
--     /api/billing/checkout creates a Razorpay order and writes nothing. Pending
--     and abandoned Pro payments were uncountable.
--   • Nothing distinguished a first Pro purchase from a renewal.
--   • A failed project payment kept no reason.
--
-- pro_orders is written at checkout and updated by the signed webhook. It is a
-- REPORTING table: access decisions still come only from subscriptions +
-- current_tier() (115). History is backfilled from billing_events.

-- ── 1. pro_orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pro_orders (
  razorpay_order_id   TEXT PRIMARY KEY,
  user_id             UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  amount_paise        INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed')),
  is_renewal          BOOLEAN NOT NULL DEFAULT FALSE,
  razorpay_payment_id TEXT,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pro_orders_user_idx ON public.pro_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pro_orders_created_idx ON public.pro_orders (created_at DESC);

ALTER TABLE public.pro_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pro_orders FROM anon, authenticated;

-- Backfill from the webhook ledger: one row per order, earliest capture wins.
INSERT INTO public.pro_orders (razorpay_order_id, user_id, amount_paise, currency, status,
                               razorpay_payment_id, created_at, paid_at, updated_at)
SELECT DISTINCT ON (ord)
       ord,
       (SELECT p.id FROM public.profiles p WHERE p.id::TEXT = x.uid_text),
       amt, cur, 'paid', pay_id, received_at, received_at, received_at
FROM (
  SELECT COALESCE(be.payload #>> '{payload,payment,entity,order_id}',
                  be.payload #>> '{payload,order,entity,id}') AS ord,
         -- user_id is nulled when the account is deleted; the notes keep it.
         COALESCE(be.user_id::TEXT,
                  be.payload #>> '{payload,payment,entity,notes,user_id}',
                  be.payload #>> '{payload,order,entity,notes,user_id}') AS uid_text,
         be.user_id,
         COALESCE((be.payload #>> '{payload,payment,entity,amount}')::INT,
                  (be.payload #>> '{payload,order,entity,amount_paid}')::INT, 0) AS amt,
         COALESCE(upper(be.payload #>> '{payload,payment,entity,currency}'), 'INR') AS cur,
         be.payload #>> '{payload,payment,entity,id}' AS pay_id,
         be.received_at
  FROM public.billing_events be
  WHERE be.kind IN ('payment.captured', 'order.paid')
) x
WHERE ord IS NOT NULL
ORDER BY ord, received_at
ON CONFLICT (razorpay_order_id) DO NOTHING;

-- Renewal = not the user's first paid order.
UPDATE public.pro_orders po
   SET is_renewal = EXISTS (
     SELECT 1 FROM public.pro_orders prev
     WHERE prev.user_id = po.user_id AND prev.status = 'paid'
       AND prev.created_at < po.created_at)
 WHERE po.user_id IS NOT NULL;

-- ── 2. project_payments.failure_reason ─────────────────────────────────────
ALTER TABLE public.project_payments
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- ── 3. record_pro_order() / settle_pro_order() — service role only ─────────
CREATE OR REPLACE FUNCTION public.record_pro_order(
  p_order_id TEXT,
  p_user_id  UUID,
  p_amount   INTEGER,
  p_currency TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.pro_orders (razorpay_order_id, user_id, amount_paise, currency, is_renewal)
  VALUES (p_order_id, p_user_id, p_amount, COALESCE(p_currency, 'INR'),
          EXISTS (SELECT 1 FROM public.pro_orders WHERE user_id = p_user_id AND status = 'paid'))
  ON CONFLICT (razorpay_order_id) DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.settle_pro_order(
  p_order_id   TEXT,
  p_user_id    UUID,
  p_status     TEXT,           -- paid | failed
  p_payment_id TEXT,
  p_amount     INTEGER,
  p_currency   TEXT,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NULL OR p_status NOT IN ('paid', 'failed') THEN
    RETURN;
  END IF;

  -- An order created before this migration, or whose checkout insert failed.
  INSERT INTO public.pro_orders (razorpay_order_id, user_id, amount_paise, currency, is_renewal)
  VALUES (p_order_id,
          CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN p_user_id END,
          COALESCE(p_amount, 0), COALESCE(p_currency, 'INR'),
          EXISTS (SELECT 1 FROM public.pro_orders WHERE user_id = p_user_id AND status = 'paid'))
  ON CONFLICT (razorpay_order_id) DO NOTHING;

  UPDATE public.pro_orders
     SET status = CASE
                    -- A late failure for an order that was ultimately paid on retry
                    -- must not undo the payment.
                    WHEN status = 'paid' THEN 'paid'
                    ELSE p_status END,
         razorpay_payment_id = CASE WHEN p_status = 'paid' THEN COALESCE(p_payment_id, razorpay_payment_id)
                                    ELSE razorpay_payment_id END,
         paid_at = CASE WHEN p_status = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
         failure_reason = CASE WHEN p_status = 'failed' AND status <> 'paid'
                               THEN left(p_reason, 300) ELSE failure_reason END,
         amount_paise = CASE WHEN p_status = 'paid' AND p_amount IS NOT NULL THEN p_amount ELSE amount_paise END,
         updated_at = now()
   WHERE razorpay_order_id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pro_order(TEXT, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_pro_order(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_pro_order(TEXT, UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_pro_order(TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- ── 4. admin_payments_ledger() ─────────────────────────────────────────────
-- One ledger over both money flows. `pending` = created < 1 h ago; older
-- unpaid rows are reported as `abandoned` (computed, never written — the project
-- ledger is not ours to mutate for reporting).
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.admin_payments_ledger(DATE, DATE, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_payments_ledger(DATE, DATE, TEXT, TEXT, TEXT, INT, INT) TO authenticated;

-- ── 5. admin_pro_subscribers() ─────────────────────────────────────────────
-- `state` mirrors current_tier() (115) exactly for "has Pro right now", and
-- splits the rest into what an operator acts on.
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.admin_pro_subscribers(TEXT, INT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pro_subscribers(TEXT, INT, INT, INT) TO authenticated;

-- ── 6. renewal_reminder_candidates() — service role, for the cron route ────
-- Stage = days until expiry bucket: 7, 3, 1, or 0 (expired within 3 days).
-- One reminder per stage per period, deduped against `reminder` notifications.
CREATE OR REPLACE FUNCTION public.renewal_reminder_candidates()
RETURNS TABLE (user_id UUID, stage INT, period_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT s.user_id, s.current_period_end,
           CASE
             WHEN s.current_period_end BETWEEN now() + INTERVAL '6 days' AND now() + INTERVAL '7 days' THEN 7
             WHEN s.current_period_end BETWEEN now() + INTERVAL '2 days' AND now() + INTERVAL '3 days' THEN 3
             WHEN s.current_period_end BETWEEN now() AND now() + INTERVAL '1 day' THEN 1
             WHEN s.current_period_end BETWEEN now() - INTERVAL '3 days' AND now() THEN 0
           END AS stage
    FROM public.subscriptions s
    WHERE s.tier = 'pro' AND s.status IN ('active', 'authenticated')
  )
  SELECT s.user_id, s.stage, s.current_period_end
  FROM s
  WHERE s.stage IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = s.user_id AND n.type = 'reminder'
        AND n.created_at > now() - INTERVAL '20 hours'
    );
$$;

REVOKE ALL ON FUNCTION public.renewal_reminder_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renewal_reminder_candidates() TO service_role;
