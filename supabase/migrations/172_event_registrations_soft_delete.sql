-- Migration 172: Deleted section for event registrations
--
-- Admins can delete a registration (soft: deleted_at is set and it moves to the
-- Deleted section), restore it, or delete it permanently from there. The
-- permanent delete is a plain DELETE by the admin route and only accepts rows
-- that are already soft-deleted.
--
-- A deleted registration no longer holds its phone number: the one-pass-per-
-- phone rule now applies to live rows only, so the same number can register
-- again (it gets a new pass code). Pass codes stay unique across everything.

ALTER TABLE public.event_registrations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_event_slug_phone_digits_key;
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_live_phone_key
  ON public.event_registrations (event_slug, phone_digits)
  WHERE deleted_at IS NULL;

-- Same as 170, with the phone lookups limited to live rows.
CREATE OR REPLACE FUNCTION public.register_for_event(
  p_event_slug TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_phone_digits TEXT,
  p_email TEXT,
  p_location TEXT,
  p_instagram_handle TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (pass_code TEXT, name TEXT, created_at TIMESTAMPTZ, already_registered BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code TEXT;
  v_attempt INT := 0;
  v_row public.event_registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.event_registrations r
   WHERE r.event_slug = p_event_slug AND r.phone_digits = p_phone_digits AND r.deleted_at IS NULL;
  IF FOUND THEN
    RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, TRUE;
    RETURN;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'INF-' || (
      SELECT string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
        FROM generate_series(1, 6)
    );
    BEGIN
      INSERT INTO public.event_registrations
        (event_slug, pass_code, name, phone, phone_digits, email, location, instagram_handle, metadata)
      VALUES
        (p_event_slug, v_code, p_name, p_phone, p_phone_digits,
         NULLIF(p_email, ''), NULLIF(p_location, ''), NULLIF(p_instagram_handle, ''),
         coalesce(p_metadata, '{}'::jsonb))
      RETURNING * INTO v_row;
      RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, FALSE;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_row
        FROM public.event_registrations r
       WHERE r.event_slug = p_event_slug AND r.phone_digits = p_phone_digits AND r.deleted_at IS NULL;
      IF FOUND THEN
        RETURN QUERY SELECT v_row.pass_code, v_row.name, v_row.created_at, TRUE;
        RETURN;
      END IF;
      IF v_attempt >= 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- Same as 171, plus p_status = 'deleted'. Every other view and every KPI counts
-- live rows only; summary.deleted feeds the Deleted tab's count.
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
           'total', count(*) FILTER (WHERE deleted_at IS NULL),
           'checked_in', count(*) FILTER (WHERE deleted_at IS NULL AND checked_in_at IS NOT NULL),
           'with_instagram', count(*) FILTER (WHERE deleted_at IS NULL AND instagram_handle IS NOT NULL),
           'today', count(*) FILTER (
             WHERE deleted_at IS NULL
               AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
           ),
           'latest_at', max(created_at) FILTER (WHERE deleted_at IS NULL),
           'deleted', count(*) FILTER (WHERE deleted_at IS NOT NULL)
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
       AND CASE v_status
             WHEN 'deleted' THEN r.deleted_at IS NOT NULL
             WHEN 'checked_in' THEN r.deleted_at IS NULL AND r.checked_in_at IS NOT NULL
             WHEN 'not_checked_in' THEN r.deleted_at IS NULL AND r.checked_in_at IS NULL
             ELSE r.deleted_at IS NULL
           END
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
                    'deleted_at', f.deleted_at,
                    'created_at', f.created_at
                  ) ORDER BY coalesce(f.deleted_at, f.created_at) DESC)
             FROM (SELECT * FROM filtered
                    ORDER BY coalesce(deleted_at, created_at) DESC
                    LIMIT LEAST(GREATEST(p_limit, 1), 500)
                   OFFSET GREATEST(p_offset, 0)) f
         ), '[]'::jsonb)
    INTO v_total, v_rows;

  RETURN jsonb_build_object('summary', v_summary, 'total', v_total, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_event_registrations_report(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_event_registrations_report(TEXT, TEXT, INT, INT) TO authenticated;
