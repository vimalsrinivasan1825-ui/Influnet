-- Migration 168: Creator Join & Traction Survey Applications
--
-- Stores structured creator intake applications submitted via https://influnet.io/join.
-- Features identity, socials, follower tiers, content categories, brand experience, and challenges.
-- Protected with RLS and exposes admin reporting via admin_creator_applications_report.

CREATE TABLE IF NOT EXISTS public.creator_join_applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number  INT GENERATED ALWAYS AS IDENTITY (START WITH 1001),
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email               TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 160),
  phone               TEXT NOT NULL CHECK (char_length(phone) BETWEEN 7 AND 30),
  instagram_handle    TEXT,
  creator_type        TEXT NOT NULL CHECK (char_length(creator_type) BETWEEN 1 AND 80),
  follower_tier       TEXT NOT NULL CHECK (char_length(follower_tier) BETWEEN 1 AND 50),
  content_niches      TEXT[] NOT NULL DEFAULT '{}',
  brand_experience    TEXT NOT NULL CHECK (char_length(brand_experience) BETWEEN 1 AND 50),
  biggest_challenge   TEXT,
  status              TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'contacted', 'accepted', 'rejected', 'archived')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_join_email_idx ON public.creator_join_applications (lower(email));
CREATE INDEX IF NOT EXISTS creator_join_created_idx ON public.creator_join_applications (created_at DESC);
CREATE INDEX IF NOT EXISTS creator_join_follower_idx ON public.creator_join_applications (follower_tier);
CREATE INDEX IF NOT EXISTS creator_join_status_idx ON public.creator_join_applications (status);

ALTER TABLE public.creator_join_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creator_join_applications FROM anon, authenticated;

-- Admin Insights Report RPC for Creator Join Applications
CREATE OR REPLACE FUNCTION public.admin_creator_applications_report(
  p_search TEXT DEFAULT '',
  p_follower_tier TEXT DEFAULT '',
  p_creator_type TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
  v_10k_plus INT;
  v_experienced INT;
  v_latest TIMESTAMPTZ;
  v_search TEXT := trim(coalesce(p_search, ''));
  v_tier TEXT := trim(coalesce(p_follower_tier, ''));
  v_type TEXT := trim(coalesce(p_creator_type, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Count in SQL per AGENTS.md rule (never count in Node)
  SELECT count(*),
         count(*) FILTER (WHERE follower_tier IN ('10K – 50K', '50K – 100K', '100K+')),
         count(*) FILTER (WHERE brand_experience ILIKE '%yes%'),
         max(created_at)
    INTO v_total, v_10k_plus, v_experienced, v_latest
    FROM public.creator_join_applications;

  RETURN jsonb_build_object(
    'summary', jsonb_build_object(
      'total', coalesce(v_total, 0),
      'over_10k', coalesce(v_10k_plus, 0),
      'experienced', coalesce(v_experienced, 0),
      'latest_at', v_latest
    ),
    'rows', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', id,
            'application_number', application_number,
            'name', name,
            'email', email,
            'phone', phone,
            'instagram_handle', instagram_handle,
            'creator_type', creator_type,
            'follower_tier', follower_tier,
            'content_niches', content_niches,
            'brand_experience', brand_experience,
            'biggest_challenge', biggest_challenge,
            'status', status,
            'metadata', metadata,
            'created_at', created_at
          )
          ORDER BY created_at DESC
        )
        FROM (
          SELECT *
            FROM public.creator_join_applications
           WHERE (v_search = '' OR (
                    name ILIKE '%' || v_search || '%' OR
                    email ILIKE '%' || v_search || '%' OR
                    phone ILIKE '%' || v_search || '%' OR
                    instagram_handle ILIKE '%' || v_search || '%'
                 ))
             AND (v_tier = '' OR follower_tier = v_tier)
             AND (v_type = '' OR creator_type = v_type)
           ORDER BY created_at DESC
           LIMIT LEAST(GREATEST(p_limit, 1), 200)
          OFFSET GREATEST(p_offset, 0)
        ) filtered
      ),
      '[]'::jsonb
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_creator_applications_report(TEXT, TEXT, TEXT, INT, INT) TO authenticated;
