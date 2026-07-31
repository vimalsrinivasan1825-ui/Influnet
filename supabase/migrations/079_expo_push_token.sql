-- Migration 079: store an Expo push token per account so the mobile app can
-- receive push notifications, not just read a list once it's already open.
--
-- notifyUser() (apps/web/src/lib/notify.ts) writes a `notifications` row for
-- every stage change, proposal, decline, etc. — but that only reaches someone
-- who happens to open the app. This column is what a push fan-out reads from.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Same allow-list pattern as migration 074/077: self-service, no privilege
-- implications, so it joins welcome_seen_at and mediakit_nudge_dismissed_at
-- rather than needing its own RPC.
GRANT UPDATE (expo_push_token) ON public.profiles TO authenticated;

-- The service-role client notifyUser() runs as needs to READ this column for
-- an arbitrary recipient (it's writing FOR another user, same as the
-- notification insert itself) — service_role already bypasses RLS/grants, so
-- no additional policy is needed here; this comment just documents why no
-- SELECT grant to `authenticated` was added (a user should not be able to
-- read another user's push token).
