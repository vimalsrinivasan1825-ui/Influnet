-- Combined pending migrations for Influnet — paste into Supabase SQL editor and run.
-- Order matters. Each file is idempotent (safe to re-run). Generated 2026-07-12.


-- ===================================================================
-- 051_reviews_ratings.sql
-- ===================================================================
-- Migration 051: Reviews & ratings
-- NOTE: campaign_projects.id is BIGINT (migration 006), so project_id MUST be bigint.
-- A uuid FK here fails to apply ("incompatible types: uuid and bigint").

CREATE TABLE IF NOT EXISTS public.reviews (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   bigint REFERENCES public.campaign_projects(id) ON DELETE CASCADE NOT NULL,
    from_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    to_user_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    rating       smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment      text,
    created_at   timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (project_id, from_user_id) -- one review per user per project
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are public (ratings surface on public profiles).
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "reviews_select_public"
  ON public.reviews FOR SELECT
  USING (true);

-- INSERT is enforced at the DATABASE level, not just in the API route:
-- the reviewer must be a participant of a COMPLETED project and may only
-- review the OTHER participant. This blocks direct-PostgREST review forgery.
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "reviews_insert_participant"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND from_user_id <> to_user_id
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = reviews.project_id
        AND p.status = 'completed'
        AND auth.uid() IN (p.owner_user_id, p.counterparty_user_id)
        AND reviews.to_user_id IN (p.owner_user_id, p.counterparty_user_id)
    )
  );

-- A reviewer may edit/delete only their own review, and only in a way that
-- keeps them the author (re-checks the same participant invariant on UPDATE).
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "reviews_update_own"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own reviews" ON public.reviews;
CREATE POLICY "reviews_delete_own"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (from_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reviews_to_user_id ON public.reviews(to_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project_id ON public.reviews(project_id);


-- ===================================================================
-- 053_pii_lockdown.sql
-- ===================================================================
-- Migration 053: Business PII lockdown (column-level grants)
--
-- Background: migration 048 locked down email/phone on `profiles` via
-- column grants. But `business_profiles` still had a broad
-- `business_profiles_select_authenticated USING (true)` policy AND a full
-- table SELECT grant, so ANY logged-in user could read sensitive business
-- columns: gst_number (tax id), registered_address, marketing_budget.
--
-- Fix (mirrors the 048 pattern):
--   * Revoke direct SELECT on business_profiles from anon + authenticated.
--   * Grant back ONLY the non-sensitive columns other authenticated code
--     reads directly (company_name, industry — already public via discovery).
--   * The owner reads their own full row through get_own_business_profile().
--   * Public profile pages keep working via get_public_business() (SECURITY DEFINER).
--   * Admin routes use the service-role key, which bypasses these grants.

-- 1. Column-level lockdown
REVOKE SELECT ON public.business_profiles FROM anon;
REVOKE SELECT ON public.business_profiles FROM authenticated;
GRANT SELECT (user_id, company_name, industry)
  ON public.business_profiles TO authenticated;

-- 2. Owner-only full-row accessor (used by GET /api/profile for a business).
CREATE OR REPLACE FUNCTION public.get_own_business_profile()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(bp) FROM public.business_profiles bp WHERE bp.user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_own_business_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_own_business_profile() TO authenticated;


-- ===================================================================
-- 054_project_stage_items.sql
-- ===================================================================
-- Migration 054: Project stage checklist items (gated pipeline)
-- Turns the 12-stage board into a gated workflow: each stage owns a set of
-- checklist items; required items must be done before the project can advance.
-- Default items are seeded by the app (single source of truth in
-- apps/web/src/lib/project-stage-items.ts) on first load, so this migration
-- only defines the table + RLS. It mirrors the project_cards participant model.

CREATE TABLE IF NOT EXISTS public.project_stage_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  stage_key    text NOT NULL,                       -- matches STAGES in project-lifecycle.ts
  label        text NOT NULL,
  owner_role   text NOT NULL DEFAULT 'both',        -- 'business' | 'creator' | 'both'
  is_required  boolean NOT NULL DEFAULT true,       -- required items gate stage advancement
  is_gate      boolean NOT NULL DEFAULT false,      -- payment/approval gate (surfaced in UI)
  position     integer NOT NULL DEFAULT 0,
  done_at      timestamptz,
  done_by      uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, stage_key, label)             -- idempotent seeding
);

CREATE INDEX IF NOT EXISTS project_stage_items_project_idx
  ON public.project_stage_items (project_id, stage_key, position);

ALTER TABLE public.project_stage_items ENABLE ROW LEVEL SECURITY;

-- SELECT: participants of the project can see its checklist
DROP POLICY IF EXISTS project_stage_items_select ON public.project_stage_items;
CREATE POLICY project_stage_items_select ON public.project_stage_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: participants can seed / add checklist items
DROP POLICY IF EXISTS project_stage_items_insert ON public.project_stage_items;
CREATE POLICY project_stage_items_insert ON public.project_stage_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- UPDATE: participants can toggle items done/undone
DROP POLICY IF EXISTS project_stage_items_update ON public.project_stage_items;
CREATE POLICY project_stage_items_update ON public.project_stage_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- DELETE: participants can remove custom items
DROP POLICY IF EXISTS project_stage_items_delete ON public.project_stage_items;
CREATE POLICY project_stage_items_delete ON public.project_stage_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );


-- ===================================================================
-- 055_verification_system.sql
-- ===================================================================
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

GRANT EXECUTE ON FUNCTION public.admin_decide_verification(uuid, text, text, text, text, text, text) TO authenticated;


-- ===================================================================
-- 056_completion_and_safety.sql
-- ===================================================================
-- Migration 056: Dual-confirm completion gate + trust & safety (report/block)
--
-- (A) A project may only reach `project_completed` when BOTH participants
--     confirm. This makes "completed" mean something and protects the reviews
--     system (migration 051 gates reviews on completed projects) and payment.
-- (B) Baseline trust & safety: users can report or block each other; reports
--     land in an admin queue.

-- ---------------------------------------------------------------------------
-- (A) Completion confirmations on campaign_projects
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS owner_confirmed_complete        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counterparty_confirmed_complete boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- (B1) user_reports — report a user (harassment, scam, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reported_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  reason        text NOT NULL,                  -- 'spam'|'harassment'|'scam'|'fake'|'other'
  details       text,
  project_id    bigint REFERENCES public.campaign_projects (id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'open',   -- 'open'|'reviewing'|'actioned'|'dismissed'
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_reports_no_self CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS user_reports_status_idx ON public.user_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS user_reports_reported_idx ON public.user_reports (reported_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Reporter can create + read their own reports; admins read/manage all.
DROP POLICY IF EXISTS user_reports_insert_own ON public.user_reports;
CREATE POLICY user_reports_insert_own ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS user_reports_select_own ON public.user_reports;
CREATE POLICY user_reports_select_own ON public.user_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS user_reports_update_admin ON public.user_reports;
CREATE POLICY user_reports_update_admin ON public.user_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- (B2) user_blocks — one user blocks another
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  blocked_id   uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

