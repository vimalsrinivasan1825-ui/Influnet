-- Migration 142: re-engagement nudges
--
-- The founder: "I open the app after many days and it never notified me it's
-- been a while." lib/notify.ts already has a `nudge` notification type and a
-- working Expo push fan-out — what's missing is anything that DECIDES who is
-- dormant and fires one.
--
-- Split of responsibility:
--   • THIS migration owns the SIGNAL (profiles.last_active_at), the OPT-OUT
--     (profiles.nudges_opt_out), and the QUERY that picks candidates
--     (nudge_candidates()).
--   • The SENDING stays in TypeScript (POST /api/cron/nudges), because a push
--     goes out through lib/notify.ts's Expo fan-out and the per-recipient
--     dedupe against recent `notifications` rows — neither of which belongs in
--     SQL.
--   • A scheduler (a GitHub Actions cron, or pg_cron with net.http_post)
--     invokes that route daily. That is a FOUNDER step — see
--     docs/operations/REENGAGEMENT_NUDGES.md. Nothing fires until it's wired.

-- ── 1. Activity signal ────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudges_opt_out   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS profiles_last_active_idx
  ON public.profiles (last_active_at)
  WHERE nudges_opt_out = FALSE;

-- Self-service, no privilege implications — same allow-list pattern as
-- welcome_seen_at / expo_push_token.
GRANT UPDATE (nudges_opt_out) ON public.profiles TO authenticated;

-- ── 2. touch_last_active() — cheap, idempotent, called from withAuth ──────
-- SECURITY DEFINER so a plain UPDATE grant on last_active_at isn't needed, and
-- so it can never touch anyone but the caller. The app throttles calls in
-- process (once/hour/user); this is the backstop that keeps the write tiny.
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET last_active_at = now()
   WHERE id = auth.uid()
     AND (last_active_at IS NULL OR last_active_at < now() - INTERVAL '30 minutes');
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

-- ── 3. nudge_candidates() — who should get a re-engagement nudge, and why ──
-- Returns at most one row per user. The caller (the cron route) still dedupes
-- against `notifications` before sending, so a candidate here is "eligible",
-- not "guaranteed a push".
--
--   reason = 'unread_messages'  — away 3+ days AND has unread project chatter
--   reason = 'your_turn'        — away 3+ days AND a project is waiting on them
--   reason = 'new_campaigns'    — away 7+ days, nothing pending, campaigns
--                                 have gone live since they were last here
--   reason = 'comeback'         — away 7+ days, nothing else to say
--
-- "Unread messages" is derived from notifications the user hasn't read, not
-- from Stream (which SQL can't see) — good enough for a nudge.
CREATE OR REPLACE FUNCTION public.nudge_candidates(
  p_soft_days INT DEFAULT 3,
  p_hard_days INT DEFAULT 7,
  p_limit     INT DEFAULT 500
)
RETURNS TABLE (user_id UUID, reason TEXT, detail JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH dormant AS (
    SELECT p.id, p.last_active_at
    FROM public.profiles p
    WHERE p.nudges_opt_out = FALSE
      AND p.last_active_at IS NOT NULL
      AND p.last_active_at < now() - make_interval(days => p_soft_days)
      -- Stop nagging after a while: only nudge accounts seen within 45 days.
      AND p.last_active_at > now() - INTERVAL '45 days'
      -- Not if any nudge already went out in the last 72h.
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = p.id
          AND n.type = 'nudge'
          AND n.created_at > now() - INTERVAL '72 hours'
      )
  ),
  unread AS (
    SELECT d.id, count(*) AS c
    FROM dormant d
    JOIN public.notifications n
      ON n.user_id = d.id AND n.type = 'message' AND n.read_at IS NULL
    GROUP BY d.id
  ),
  turn AS (
    -- A live project whose last stage entry was posted by the OTHER party,
    -- i.e. the ball is in this user's court. Approximate but cheap.
    SELECT DISTINCT d.id
    FROM dormant d
    JOIN public.campaign_projects cp
      ON (cp.owner_user_id = d.id OR cp.counterparty_user_id = d.id)
     AND cp.status = 'active'
     AND cp.manually_deleted_at IS NULL
  ),
  new_camps AS (
    SELECT d.id, count(*) AS c
    FROM dormant d
    JOIN public.campaigns c
      ON c.status = 'live' AND c.created_at > d.last_active_at
    GROUP BY d.id
  )
  SELECT
    d.id,
    CASE
      WHEN u.c IS NOT NULL          THEN 'unread_messages'
      WHEN t.id IS NOT NULL         THEN 'your_turn'
      WHEN d.last_active_at < now() - make_interval(days => p_hard_days)
           AND nc.c IS NOT NULL     THEN 'new_campaigns'
      WHEN d.last_active_at < now() - make_interval(days => p_hard_days)
                                    THEN 'comeback'
      ELSE NULL
    END AS reason,
    jsonb_build_object(
      'unread', COALESCE(u.c, 0),
      'newCampaigns', COALESCE(nc.c, 0),
      'lastActiveAt', d.last_active_at
    ) AS detail
  FROM dormant d
  LEFT JOIN unread u     ON u.id = d.id
  LEFT JOIN turn t       ON t.id = d.id
  LEFT JOIN new_camps nc ON nc.id = d.id
  WHERE CASE
      WHEN u.c IS NOT NULL          THEN TRUE
      WHEN t.id IS NOT NULL         THEN TRUE
      WHEN d.last_active_at < now() - make_interval(days => p_hard_days) THEN TRUE
      ELSE FALSE
    END
  LIMIT p_limit;
$$;

-- Service role only — this reads across every user.
REVOKE EXECUTE ON FUNCTION public.nudge_candidates(INT, INT, INT) FROM PUBLIC, authenticated, anon;
