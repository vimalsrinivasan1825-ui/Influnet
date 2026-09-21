-- Migration 166: Early Access & Founder Pass Waitlist
--
-- Tracks early access registrations from the landing page and public pass generator.
-- Supports both creators and businesses, stores verified metadata, and reports to Admin Insights.

CREATE TABLE IF NOT EXISTS public.early_access_signups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_number   INT GENERATED ALWAYS AS IDENTITY (START WITH 101),
  kind          TEXT NOT NULL CHECK (kind IN ('creator', 'business')),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email         TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 160),
  handle        TEXT,
  company       TEXT,
  website       TEXT,
  followers     TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'invited', 'joined', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS early_access_email_idx ON public.early_access_signups (lower(email));
CREATE INDEX IF NOT EXISTS early_access_kind_created_idx ON public.early_access_signups (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS early_access_pass_num_idx ON public.early_access_signups (pass_number);

ALTER TABLE public.early_access_signups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.early_access_signups FROM anon, authenticated;

-- Admin Insights Report for Early Access passes
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

  -- Compute KPIs in SQL (never count in Node per AGENTS.md)
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
              coalesce(handle, '') ILIKE '%' || v_search || '%' OR
              coalesce(company, '') ILIKE '%' || v_search || '%'
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

COMMENT ON TABLE public.early_access_signups IS
  'Early access signups and Founder Pass recipients for creators and businesses.';
