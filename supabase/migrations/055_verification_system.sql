-- Migration 055: Non-blocking verification & trust-badge system
-- Unifies business `approval_status` and influencer `is_verified` under a single
-- profiles.verification_status state machine, adds an auditable checks table and
-- a job queue. NOTHING here blocks access — verification only drives the badge.
--
--   unverified -> pending -> in_review -> { verified | rejected }
--                    |                          |
--                    +------ needs_more_info ---+
--
-- The AI/heuristic scorer may AUTO-APPROVE (high confidence) but must NEVER
-- auto-reject; all negatives escalate to a human admin.

-- ---------------------------------------------------------------------------
-- 1. profiles: verification columns (badge reads are fast + non-sensitive)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS verified_badge      boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_verification_status_idx
  ON public.profiles (verification_status);

-- Badge columns are non-sensitive and needed to render trust signals on other
-- users' cards. Migration 048 revoked broad SELECT and re-granted a column list;
-- extend that grant with the verification columns.
GRANT SELECT (verification_status, verified_badge, verified_at)
  ON public.profiles TO authenticated;

-- Keep the fast-read badge flag in sync with the status.
CREATE OR REPLACE FUNCTION public.sync_verified_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.verified_badge := (NEW.verification_status = 'verified');
  IF NEW.verification_status = 'verified' AND NEW.verified_at IS NULL THEN
    NEW.verified_at := now();
  ELSIF NEW.verification_status <> 'verified' THEN
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_verified_badge ON public.profiles;
CREATE TRIGGER profiles_sync_verified_badge
  BEFORE INSERT OR UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_verified_badge();

-- ---------------------------------------------------------------------------
-- 2. Backfill from existing signals
-- ---------------------------------------------------------------------------
-- Businesses: approved -> verified, rejected -> rejected, else pending.
UPDATE public.profiles p SET verification_status = 'verified'
  FROM public.business_profiles b
  WHERE b.user_id = p.id AND b.approval_status = 'approved'
    AND p.verification_status = 'unverified';
UPDATE public.profiles p SET verification_status = 'rejected'
  FROM public.business_profiles b
  WHERE b.user_id = p.id AND b.approval_status = 'rejected'
    AND p.verification_status = 'unverified';

-- Influencers already flagged is_verified -> verified.
UPDATE public.profiles p SET verification_status = 'verified'
  FROM public.influencer_profiles i
  WHERE i.user_id = p.id AND i.is_verified = true
    AND p.verification_status = 'unverified';

-- Re-stamp verified_badge/verified_at for the rows we just changed.
UPDATE public.profiles SET verification_status = verification_status
  WHERE verification_status IN ('verified', 'rejected');

-- ---------------------------------------------------------------------------
-- 3. verification_checks: one row per attempt (full audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_checks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role           text NOT NULL,                    -- 'business_owner' | 'influencer'
  status         text NOT NULL DEFAULT 'pending',  -- pending|in_review|verified|rejected|needs_more_info
  ai_score       numeric,                          -- 0.00–1.00 confidence
  ai_reason      text,                             -- scorer explanation (admin-facing)
  ai_signals     jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by     text,                             -- 'ai' | admin user_id (uuid as text)
  decided_at     timestamptz,
  reviewer_notes text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_checks_user_idx
  ON public.verification_checks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_checks_status_idx
  ON public.verification_checks (status) WHERE status IN ('pending', 'in_review');

ALTER TABLE public.verification_checks ENABLE ROW LEVEL SECURITY;

-- User reads own checks; admins read all (is_admin from migration 038).
DROP POLICY IF EXISTS verification_checks_select_own ON public.verification_checks;
CREATE POLICY verification_checks_select_own ON public.verification_checks
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Writes are performed by the server via the service-role key (bypasses RLS);
-- no direct authenticated INSERT/UPDATE policy is granted on purpose.

-- ---------------------------------------------------------------------------
-- 4. verification_jobs: lightweight queue the worker drains
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role         text NOT NULL,
  status       text NOT NULL DEFAULT 'queued',     -- queued|processing|done|error
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_jobs_pending_idx
  ON public.verification_jobs (created_at) WHERE status IN ('queued', 'processing');

ALTER TABLE public.verification_jobs ENABLE ROW LEVEL SECURITY;
-- Queue is server-only (service role). Users learn status via profiles /
-- verification_checks, not by reading the queue directly.
DROP POLICY IF EXISTS verification_jobs_select_own ON public.verification_jobs;
CREATE POLICY verification_jobs_select_own ON public.verification_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. submit_verification(): self-service scorer result writer
-- The Node pipeline scrapes + scores, then calls this to persist the check,
-- move the caller's own status, and notify. SECURITY DEFINER so it can write
-- verification_checks (no direct authenticated INSERT policy) without needing
-- the service-role key. It can NEVER set 'rejected' — only a human can.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_verification(
  p_signals     jsonb,
  p_score       numeric,
  p_reason      text,
  p_status      text,
  p_notif_type  text,
  p_notif_title text,
  p_notif_body  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid   uuid := auth.uid();
  urole text;
  check_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_status NOT IN ('pending', 'in_review', 'needs_more_info', 'verified') THEN
    RAISE EXCEPTION 'Invalid self-service status: %', p_status;
  END IF;

  SELECT role INTO urole FROM public.profiles WHERE id = uid;

  INSERT INTO public.verification_checks (user_id, role, status, ai_score, ai_reason, ai_signals, decided_by, decided_at)
  VALUES (uid, urole, p_status, p_score, p_reason, COALESCE(p_signals, '{}'::jsonb), 'ai', now())
  RETURNING id INTO check_id;

  UPDATE public.profiles SET verification_status = p_status, updated_at = now()
  WHERE id = uid;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (uid, p_notif_type, p_notif_title, p_notif_body, '/dashboard/settings');

  RETURN jsonb_build_object('check_id', check_id, 'status', p_status, 'score', p_score);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_verification(jsonb, numeric, text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. admin_decide_verification(): human escalation resolver (admin-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_verification(
  p_user_id     uuid,
  p_status      text,
  p_notes       text,
  p_notif_type  text,
  p_notif_title text,
  p_notif_body  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urole text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_status NOT IN ('verified', 'rejected', 'needs_more_info', 'in_review') THEN
    RAISE EXCEPTION 'Invalid admin status: %', p_status;
  END IF;

  SELECT role INTO urole FROM public.profiles WHERE id = p_user_id;

  -- Resolve the latest open check (if any) for the audit trail.
  UPDATE public.verification_checks
    SET status = p_status, reviewer_notes = p_notes, decided_by = auth.uid()::text, decided_at = now()
  WHERE id = (
    SELECT id FROM public.verification_checks
    WHERE user_id = p_user_id AND status IN ('pending', 'in_review')
    ORDER BY created_at DESC LIMIT 1
  );

  UPDATE public.profiles SET verification_status = p_status, updated_at = now()
  WHERE id = p_user_id;

  -- Keep legacy business approval_status in sync so the old admin screen agrees.
  IF urole = 'business_owner' THEN
    UPDATE public.business_profiles
      SET approval_status = CASE WHEN p_status = 'verified' THEN 'approved'
                                 WHEN p_status = 'rejected' THEN 'rejected'
                                 ELSE 'pending_review' END,
          updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_notif_type, p_notif_title, p_notif_body, '/dashboard/settings');

  RETURN jsonb_build_object('user_id', p_user_id, 'status', p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_decide_verification(uuid, text, text, text, text, text) TO authenticated;
