-- Migration 152: admin CRM foundations — daily activity history + project completed_at
--
-- WHY: see docs/product/ADMIN_CRM_ANALYSIS_2026-09-17.md §3. Two facts the admin
-- analytics need are not recorded anywhere today:
--
--   1. WHO WAS ACTIVE ON WHICH DAY. profiles.last_active_at (142) is overwritten,
--      so yesterday's DAU is gone the moment someone opens the app today. DAU /
--      WAU / MAU, retention cohorts, the weekday × hour heatmap and the platform
--      split all need one row per user per IST day.
--
--   2. WHEN A PROJECT COMPLETED. campaign_projects has no completed_at, so the
--      growth chart approximates completion by updated_at (see 098). A trigger
--      sets it on the transition and a backfill recovers history from
--      project_activity.
--
-- Everything else in the admin analytics is DERIVED from existing tables; these
-- are the only additions, per the "derive, don't log" rule (073, 099).

-- ── 1. user_daily_activity ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_daily_activity (
  user_id       UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  day_ist       DATE NOT NULL,
  platform      TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android', 'unknown')),
  app_version   TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- bit n set = active during IST hour n (0–23). Feeds the weekday × hour heatmap
  -- without a row per hour.
  hours_bitmap  INTEGER NOT NULL DEFAULT 0,
  hits          INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day_ist, platform)
);

COMMENT ON TABLE public.user_daily_activity IS
  'One row per user per IST day per platform. Written only by touch_activity(); read only by is_admin() analytics RPCs.';

CREATE INDEX IF NOT EXISTS user_daily_activity_day_idx
  ON public.user_daily_activity (day_ist, platform);

ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;
-- No policies: nobody signed in reads or writes this directly.
REVOKE ALL ON public.user_daily_activity FROM anon, authenticated;

-- ── 2. touch_activity(platform, version) ───────────────────────────────────
-- Called fire-and-forget from withAuth (apps/web/src/lib/api.ts), throttled in
-- process. Supersedes touch_last_active() for the app, and keeps doing its job:
-- last_active_at is still bumped (nudge_candidates reads it).
--
-- The platform/version come from a client header, so they are a LABEL, not a
-- claim — an unknown platform is stored as 'unknown', a long version is cut.
CREATE OR REPLACE FUNCTION public.touch_activity(
  p_platform    TEXT DEFAULT 'unknown',
  p_app_version TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      TIMESTAMPTZ := now();
  v_ist      TIMESTAMP := now() AT TIME ZONE 'Asia/Kolkata';
  v_platform TEXT;
  v_bit      INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_platform := CASE WHEN p_platform IN ('web', 'ios', 'android') THEN p_platform ELSE 'unknown' END;
  v_bit := 1 << extract(hour FROM v_ist)::INT;

  INSERT INTO public.user_daily_activity AS a (user_id, day_ist, platform, app_version, hours_bitmap)
  VALUES (v_uid, v_ist::DATE, v_platform, left(nullif(trim(p_app_version), ''), 32), v_bit)
  ON CONFLICT (user_id, day_ist, platform) DO UPDATE
    SET last_seen_at = v_now,
        hours_bitmap = a.hours_bitmap | EXCLUDED.hours_bitmap,
        hits         = a.hits + 1,
        app_version  = COALESCE(EXCLUDED.app_version, a.app_version);

  UPDATE public.profiles
     SET last_active_at = v_now
   WHERE id = v_uid
     AND (last_active_at IS NULL OR last_active_at < v_now - INTERVAL '30 minutes');
EXCEPTION
  -- An auth user with no profile row yet (mid-signup) has nothing to attach to.
  WHEN foreign_key_violation THEN
    RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_activity(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_activity(TEXT, TEXT) TO authenticated;

-- Seed: the one day we DO know about for each account — its last activity — so
-- the first charts are not completely empty. Platform unknown, history starts here.
INSERT INTO public.user_daily_activity (user_id, day_ist, platform, first_seen_at, last_seen_at, hours_bitmap)
SELECT p.id,
       (p.last_active_at AT TIME ZONE 'Asia/Kolkata')::DATE,
       'unknown',
       p.last_active_at,
       p.last_active_at,
       1 << extract(hour FROM p.last_active_at AT TIME ZONE 'Asia/Kolkata')::INT
FROM public.profiles p
WHERE p.last_active_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 3. campaign_projects.completed_at ──────────────────────────────────────
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE public.campaign_projects cp
   SET completed_at = COALESCE(
         (SELECT min(pa.created_at) FROM public.project_activity pa
           WHERE pa.project_id = cp.id
             AND pa.type IN ('project_completed', 'completion_confirmed')),
         cp.updated_at)
 WHERE cp.status = 'completed'
   AND cp.completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_project_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF OLD.status IS DISTINCT FROM 'completed' OR NEW.completed_at IS NULL THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- `zz_` so it runs AFTER enforce_project_consent (BEFORE triggers fire in name
-- order): the consent trigger must judge the caller's change, not ours.
DROP TRIGGER IF EXISTS zz_set_project_completed_at ON public.campaign_projects;
CREATE TRIGGER zz_set_project_completed_at
  BEFORE UPDATE OF status ON public.campaign_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_completed_at();

CREATE INDEX IF NOT EXISTS campaign_projects_completed_at_idx
  ON public.campaign_projects (completed_at) WHERE completed_at IS NOT NULL;
