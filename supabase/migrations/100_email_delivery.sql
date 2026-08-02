-- Migration 098: email preferences, suppressions and a delivery ledger.
--
-- Background: notifyUser() (apps/web/src/lib/notify.ts) is the single fan-out
-- point for ~21 call sites, and adding email there means every one of them
-- starts mailing — including the per-chat-message ones. Three tables turn that
-- from a spam cannon into a controlled channel:
--
--   email_preferences  — per-user, per-category opt-out. Absent row = defaults
--                        (activity ON, marketing OFF), so no backfill is needed
--                        and a missing row can never silently mute someone.
--   email_suppressions — hard blocks fed by Resend bounce/complaint webhooks.
--                        Mailing a bounced address again is what gets a sending
--                        domain blacklisted, so this check comes before all
--                        others and has no override.
--   email_deliveries   — one row per attempted send. Powers the unique dedupe
--                        key (webhook redeliveries can't double-send), the
--                        per-user daily cap, and answering "did they get it?".
--
-- Only email_preferences is user-facing. The other two are service-role only:
-- RLS is enabled with no policies, which denies every anon/authenticated read
-- while the service-role key continues to bypass RLS entirely.

-- ── Preferences ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Tier B: activity about a collaboration the user is party to. On by
  -- default — a business waiting on a creator is the point of the product.
  collab     boolean NOT NULL DEFAULT true,
  project    boolean NOT NULL DEFAULT true,
  payment    boolean NOT NULL DEFAULT true,
  message    boolean NOT NULL DEFAULT true,
  -- Tier C: product news. Off by default. Under India's DPDP Act 2023 a
  -- pre-ticked box is not consent, so this may only ever be flipped on by an
  -- explicit user action.
  marketing  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_preferences IS
  'Per-user email opt-outs. A missing row means defaults: activity on, marketing off.';

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_preferences_select_own" ON public.email_preferences;
CREATE POLICY "email_preferences_select_own" ON public.email_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "email_preferences_insert_own" ON public.email_preferences;
CREATE POLICY "email_preferences_insert_own" ON public.email_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- WITH CHECK repeats the predicate so an UPDATE cannot re-point the row at
-- another user_id (USING alone only gates which rows are visible to update).
DROP POLICY IF EXISTS "email_preferences_update_own" ON public.email_preferences;
CREATE POLICY "email_preferences_update_own" ON public.email_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.email_preferences TO authenticated;

-- ── Suppressions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email      text PRIMARY KEY,
  -- 'bounced' | 'complained' | 'unsubscribed_all' | 'manual'
  reason     text NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_suppressions IS
  'Addresses we must never mail again. Fed by the Resend bounce/complaint webhook. Service-role only.';

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny-all for anon/authenticated, service role bypasses.

-- ── Delivery ledger ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_email    text NOT NULL,
  template    text NOT NULL,
  category    text NOT NULL,
  -- Unique per logical event. The insert happens BEFORE the Resend call, so a
  -- retry or a duplicate webhook delivery loses the race on this constraint and
  -- skips the send instead of mailing twice.
  dedupe_key  text UNIQUE,
  resend_id   text,
  -- 'sent' | 'skipped' | 'failed' | 'bounced' | 'complained'
  status      text NOT NULL DEFAULT 'sent',
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_deliveries IS
  'One row per attempted send. Powers dedupe, the per-user daily cap, and delivery debugging. Service-role only.';

-- The daily-cap query is "count this user's sends since midnight", so lead with
-- user_id and keep created_at descending in the same index.
CREATE INDEX IF NOT EXISTS email_deliveries_user_created_idx
  ON public.email_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_deliveries_resend_id_idx
  ON public.email_deliveries (resend_id)
  WHERE resend_id IS NOT NULL;

ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny-all for anon/authenticated, service role bypasses.
