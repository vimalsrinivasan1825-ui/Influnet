-- Migration 171: Admin report + check-in for event registrations (migration 170)
--
-- Backs /dashboard/admin/event-registrations. Reached only through
-- /api/admin/insights/event_registrations (module whitelisted in
-- lib/admin-insights.ts) and guarded by is_admin(), like every admin_* report.
-- Counts happen here, never in Node (PostgREST caps responses at 1000 rows).
--
-- Search also matches the pass code, so the door team can type INF-XXXXXX to
-- find someone and check them in.

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
           'total', count(*),
           'checked_in', count(*) FILTER (WHERE checked_in_at IS NOT NULL),
           'with_instagram', count(*) FILTER (WHERE instagram_handle IS NOT NULL),
           'today', count(*) FILTER (
             WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
           ),
           'latest_at', max(created_at)
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
       AND (v_status = ''
            OR (v_status = 'checked_in' AND r.checked_in_at IS NOT NULL)
            OR (v_status = 'not_checked_in' AND r.checked_in_at IS NULL))
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
                    'created_at', f.created_at
                  ) ORDER BY f.created_at DESC)
             FROM (SELECT * FROM filtered
                    ORDER BY created_at DESC
                    LIMIT LEAST(GREATEST(p_limit, 1), 500)
                   OFFSET GREATEST(p_offset, 0)) f
         ), '[]'::jsonb)
    INTO v_total, v_rows;

  RETURN jsonb_build_object('summary', v_summary, 'total', v_total, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_event_registrations_report(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_event_registrations_report(TEXT, TEXT, INT, INT) TO authenticated;
