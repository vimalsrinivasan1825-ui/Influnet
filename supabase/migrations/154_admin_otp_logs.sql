-- Migration 154: OTP logs for the admin console + retention purge
--
-- WHY: phone_otp_sessions and phone_otp_audit_log (022) record every signup OTP
-- send and verify, but they are RLS deny-all and had no screen. The admin needs
-- delivery health (a broken 2Factor template silently became VOICE CALLS once —
-- see AGENTS.md), abuse signals (many sends to one number), and cost.
--
-- PRIVACY: phone numbers are masked for a normal admin and shown in full only to
-- a super admin (migration 150's is_super_admin). OTP codes were never stored and
-- still are not. Rows older than 90 days are purged by purge_old_otp_logs(),
-- called from the daily cron route.

CREATE OR REPLACE FUNCTION public.caller_is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_super_admin = TRUE
  );
$$;
REVOKE ALL ON FUNCTION public.caller_is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.mask_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN length(p_phone) <= 6 THEN '••••'
    ELSE left(p_phone, 3) || ' ••••• ' || right(p_phone, 3)
  END;
$$;

CREATE INDEX IF NOT EXISTS phone_otp_sessions_created_idx ON public.phone_otp_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS phone_otp_audit_created_idx ON public.phone_otp_audit_log (created_at DESC);

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
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

REVOKE ALL ON FUNCTION public.admin_otp_logs(DATE, DATE, TEXT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_otp_logs(DATE, DATE, TEXT, TEXT, TEXT, INT, INT) TO authenticated;

-- ── Retention ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_old_otp_logs(p_days INT DEFAULT 90)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INT := greatest(coalesce(p_days, 90), 30);  -- never purge the last 30 days
  v_sessions INT;
  v_audit INT;
BEGIN
  DELETE FROM public.phone_otp_sessions WHERE created_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  DELETE FROM public.phone_otp_audit_log WHERE created_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_audit = ROW_COUNT;
  RETURN jsonb_build_object('sessions', v_sessions, 'audit', v_audit, 'older_than_days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_otp_logs(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_otp_logs(INT) TO service_role;
