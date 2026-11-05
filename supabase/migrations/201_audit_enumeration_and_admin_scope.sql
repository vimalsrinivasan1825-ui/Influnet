-- Migration 201: close two direct-PostgREST gaps found in the 2026-11-05 audit.
--
-- 1. Account enumeration. check_email_available() and check_phone_available()
--    were granted to `anon`. /api/auth/check-email and /api/auth/check-phone
--    rate-limit them (30/min per IP), but any client holding the public anon
--    key could call the RPCs directly through PostgREST with no limit at all
--    and test, at full speed, whether a given email or phone number has an
--    Influnet account. Both routes now call them with the service-role client,
--    so the only way in is through the rate limit.
--
--    Username and Instagram checks are left public on purpose: both are
--    already visible on public profiles, so a lookup reveals nothing new.
--    Functions that call these internally are SECURITY DEFINER and run as the
--    owner, so they are unaffected by the revoke.
--
-- 2. admin_early_access_report() still checked is_admin() only. Migration 196
--    moved every other admin_* RPC to admin_has_permission(); this one was
--    missed because 167 re-created it without the change. Any staff JWT could
--    read the whole waitlist (names, emails, phones) directly, outside its
--    sections and without hidden-field masking. Body is otherwise unchanged
--    from 167.

REVOKE ALL ON FUNCTION public.check_email_available(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_available(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.check_phone_available(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_available(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_early_access_report(
  p_search TEXT DEFAULT '',
  p_kind TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB;
  v_total INT;
  v_creators INT;
  v_businesses INT;
  v_latest TIMESTAMPTZ;
  v_search TEXT := trim(coalesce(p_search, ''));
  v_kind TEXT := trim(coalesce(p_kind, ''));
BEGIN
  IF NOT public.admin_has_permission('early_access', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE kind = 'creator'),
         count(*) FILTER (WHERE kind = 'business'),
         max(created_at)
    INTO v_total, v_creators, v_businesses, v_latest
    FROM public.early_access_signups;

  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'creators', coalesce(v_creators, 0),
      'businesses', coalesce(v_businesses, 0),
      'latest_at', v_latest
    ),
    'rows', coalesce(
      (
        SELECT jsonb_agg(to_jsonb(r))
        FROM (
          SELECT
            id,
            pass_number,
            kind,
            name,
            email,
            phone,
            handle,
            company,
            website,
            followers,
            avatar_url,
            bio,
            status,
            created_at
          FROM public.early_access_signups
          WHERE (v_kind = '' OR kind = v_kind)
            AND (v_search = '' OR (
              name ILIKE '%' || v_search || '%' OR
              email ILIKE '%' || v_search || '%' OR
              coalesce(phone, '') ILIKE '%' || v_search || '%' OR
              coalesce(handle, '') ILIKE '%' || v_search || '%' OR
              coalesce(company, '') ILIKE '%' || v_search || '%' OR
              coalesce(website, '') ILIKE '%' || v_search || '%'
            ))
          ORDER BY created_at DESC
          LIMIT greatest(1, least(p_limit, 500))
          OFFSET greatest(0, p_offset)
        ) r
      ),
      '[]'::jsonb
    )
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_early_access_report(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_early_access_report(TEXT, TEXT, INT, INT) TO authenticated;
