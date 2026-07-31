-- Migration 078: fix the actual root cause of the welcome card reappearing.
--
-- Migration 048 column-grants SELECT on public.profiles to authenticated for
-- exactly: id, role, name, location, created_at, updated_at. Migration 074
-- added the welcome_seen_at COLUMN and a column-level UPDATE grant for it, but
-- never added it to 048's SELECT allow-list. Same gap for
-- mediakit_nudge_dismissed_at, added by 077.
--
-- Effect: apps/web/src/app/api/influencer/dashboard/route.ts does
--   supabase.from('profiles').select('name, location, welcome_seen_at')...
-- directly (not through the get_own_profile() SECURITY DEFINER RPC, which
-- bypasses column grants). Selecting a column outside the granted set fails
-- the WHOLE query with a permission error at the database level. The route
-- never checks profileRes.error, so profileData silently becomes null and
-- `welcome_seen` is ALWAYS undefined — meaning the server-side "already
-- shown" flag written by migration 074 could never actually be read back,
-- on any browser, on any device, ever. The one-time welcome card had no
-- working cross-session memory at all; only the client-side localStorage
-- fallback was ever doing anything, and only for as long as it hadn't been
-- reset (or read as its own stale/default state at the very first paint).
--
-- Fix: extend the SELECT grant to include both self-service flags.

GRANT SELECT (welcome_seen_at, mediakit_nudge_dismissed_at)
  ON public.profiles TO authenticated;
