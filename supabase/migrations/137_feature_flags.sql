-- Migration 137: runtime feature flags
--
-- Four switches decide how much of the product is live — the phone-OTP signup
-- gate, the notification-email master switch, the Free/Pro paid tier, and the
-- creator ownership gate. Until now each was a deploy-time environment variable:
-- flipping one on dev meant a container update (or, for the OTP flag, a full
-- rebuild), and `SUBSCRIPTIONS_ENABLED` wasn't even per-environment — it was
-- hard-coded `true` in both deploy workflows.
--
-- This table makes them runtime-toggleable per environment for free: dev and
-- staging already have their own Supabase project each, so a row here is
-- inherently scoped to one environment. Flip a boolean in the dashboard and the
-- server picks it up within ~45s (lib/feature-flags.ts caches it).
--
-- Deliberately seeded EMPTY. `flag()` falls back to the existing environment
-- variable for any key with no row, so applying this migration changes nothing
-- on either environment until someone inserts a row. To start controlling a
-- flag from the database, upsert it:
--
--   insert into public.feature_flags (key, enabled) values ('subscriptions', false)
--   on conflict (key) do update set enabled = excluded.enabled;
--
-- Staging is meant to run all four ON at all times. After this migration
-- reaches staging, seed it once (and instrumentation.ts refuses to boot staging
-- if any row here is explicitly false):
--
--   insert into public.feature_flags (key, enabled) values
--     ('phone_otp', true), ('notify_emails', true),
--     ('subscriptions', true), ('ownership_gate', true)
--   on conflict (key) do update set enabled = true;

CREATE TABLE IF NOT EXISTS public.feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  -- Free-text note for whoever opens this in the dashboard at 2am.
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The recognised keys. A CHECK rather than an enum so adding a flag later is a
-- one-line migration, not an ALTER TYPE. An unknown key is harmless (nothing
-- reads it) but almost certainly a typo, so reject it at write time.
ALTER TABLE public.feature_flags
  DROP CONSTRAINT IF EXISTS feature_flags_key_known;
ALTER TABLE public.feature_flags
  ADD CONSTRAINT feature_flags_key_known
  CHECK (key IN ('phone_otp', 'notify_emails', 'subscriptions', 'ownership_gate'));

DROP TRIGGER IF EXISTS feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Read-only to the world. The values are booleans with no secrecy value, and
-- /api/auth/config serves `phone_otp` to unauthenticated visitors already.
-- Writes have NO policy, so only the service role (which bypasses RLS) — the
-- Supabase dashboard SQL editor, or a service-role script — can change them.
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_read_all ON public.feature_flags;
CREATE POLICY feature_flags_read_all
  ON public.feature_flags
  FOR SELECT
  USING (true);

GRANT SELECT ON public.feature_flags TO anon, authenticated;
