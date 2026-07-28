-- Migration 085: remember the "Verify your Instagram" dashboard nudge
-- dismissal per ACCOUNT, not per browser — same fix as 074 (welcome card) and
-- 077 (media-kit nudge) applied to the ownership-verification nudge.
--
-- Unlike the other two, this dismissal is a SNOOZE, not permanent: an
-- unverified creator who dismisses forever never gets nudged again, and
-- ownership verification gates auto-approval (verification.ts) and the
-- business-facing trust signal (084) — staying unverified has real cost to
-- the creator. The application re-shows the nudge once the dismissal is
-- older than 7 days AND the account is still unverified; this column only
-- stores the timestamp, the snooze window is enforced client-side.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ownership_nudge_dismissed_at TIMESTAMPTZ;

-- Self-service, no privilege — joins welcome_seen_at / mediakit_nudge_dismissed_at
-- on migration 070's per-column allow-list.
GRANT UPDATE (ownership_nudge_dismissed_at) ON public.profiles TO authenticated;

-- Also needed for SELECT — see 078, which fixed the identical bug for the two
-- existing nudge-dismissal columns (selecting a column outside 048's
-- SELECT allow-list fails the WHOLE query, not just that column).
GRANT SELECT (ownership_nudge_dismissed_at) ON public.profiles TO authenticated;
