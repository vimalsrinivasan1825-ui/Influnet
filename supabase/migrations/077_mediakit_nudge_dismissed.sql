-- Migration 077: remember the media-kit nudge dismissal per ACCOUNT, not per
-- browser — the exact same fix migration 074 made for the welcome card.
--
-- The "Complete your media kit" nudge was dismissed via localStorage only, so
-- a creator who dismissed it on one device (or browser profile) saw it again
-- on every other device, in a private window, or after clearing site data.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mediakit_nudge_dismissed_at TIMESTAMPTZ;

-- Migration 070 revoked blanket UPDATE on profiles and re-granted it column by
-- column. This flag is self-service and carries no privilege, so it joins
-- that allow-list alongside welcome_seen_at; `role` and the verification
-- columns stay locked.
GRANT UPDATE (mediakit_nudge_dismissed_at) ON public.profiles TO authenticated;
