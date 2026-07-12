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
