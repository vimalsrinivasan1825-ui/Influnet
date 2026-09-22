-- Migration 167: Add Phone Support & Delete Helper to Early Access Waitlist
--
-- Adds optional phone number for launch WhatsApp/SMS alerts.
-- Updates admin_early_access_report to return phone and website columns.

ALTER TABLE public.early_access_signups ADD COLUMN IF NOT EXISTS phone TEXT;

-- Update Admin Insights Report to return phone
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
  IF NOT public.is_admin() THEN
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
