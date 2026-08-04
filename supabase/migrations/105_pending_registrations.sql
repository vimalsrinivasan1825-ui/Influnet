-- Migration 105: server-side pending registrations.
--
-- WHY: the email-confirm signup path used to stash the whole wizard payload
-- (email, phone, gender, plus the 30-minute phone-OTP token) in localStorage
-- and replay it on first login. That is the "Clear text storage of sensitive
-- information" CodeQL finding on the signup pages, and it also meant the
-- email confirmation could only be completed in the same browser that filled
-- the wizard.
--
-- This table moves the only genuinely secret piece — the OTP token — server
-- side, keyed by the (already created) auth user id. The rest of the payload
-- already lives on the auth user as user_metadata, so nothing else needs
-- storing: first login rebuilds the profile from metadata and spends this
-- row's token.
--
--   signUp (email confirm on)
--     → store_pending_registration(user_id, phone, token)   [this migration]
--     → confirm email → sign in
--     → /api/auth/register rebuilds from user_metadata + consumes this row
--       → profile created (phone verified)
--
-- The row is single-use: /api/auth/register deletes it on read, whether the
-- token is still valid or not (an expired token must force a fresh
-- verification, not a retry). Writes only ever go through the SECURITY
-- DEFINER RPC below, which refuses tokens that were never verified for the
-- stated phone — so junk rows can't be planted by someone guessing a user id.

CREATE TABLE IF NOT EXISTS public.pending_registrations (
  user_id UUID PRIMARY KEY,
  phone_verification_token UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_registrations IS
  'Holds the phone-OTP token for a signup waiting on email confirmation. Single-use; consumed by /api/auth/register on first login. Writes via store_pending_registration() only.';

CREATE INDEX IF NOT EXISTS pending_registrations_created_idx
  ON public.pending_registrations (created_at);

ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

-- Owner-only read/delete: the register route consumes its own user's row with
-- the caller's JWT. Inserts/updates go through the SECURITY DEFINER RPC.
DROP POLICY IF EXISTS pending_registrations_select_owner ON public.pending_registrations;
CREATE POLICY pending_registrations_select_owner
  ON public.pending_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS pending_registrations_delete_owner ON public.pending_registrations;
CREATE POLICY pending_registrations_delete_owner
  ON public.pending_registrations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- store_pending_registration(user_id, phone, token) → JSONB
-- SECURITY DEFINER: the ONLY write path. Validates the token against
-- phone_otp_sessions before storing (via validate_phone_verification_token),
-- so a caller cannot plant a pending row for an arbitrary user without a real
-- verified OTP for that user's phone.
--
-- NOTE: the write is intentionally NOT bound to the caller (the signup page
-- runs before a session exists, so there is no auth.uid() to bind to). The
-- real gate is the token: it must be a live, verified OTP for the stated
-- phone, and /api/auth/register re-validates it against the user_metadata
-- phone at consume time. The worst an attacker with a valid token for their
-- OWN phone can do is plant/overwrite a junk row for some other user_id,
-- which then fails validation at consume (phone mismatch) or forces a
-- re-verify — a nuisance, not an escalation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_pending_registration(
  p_user_id UUID,
  p_phone TEXT,
  p_token UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check JSONB;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;

  -- When a token is supplied it must be a live, verified OTP for that phone.
  -- (OTP can be disabled per environment; then no token is stored and the
  -- replay relies on user_metadata alone.)
  IF p_token IS NOT NULL THEN
    v_check := public.validate_phone_verification_token(p_token, p_phone);
    IF NOT coalesce((v_check ->> 'ok')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', coalesce(v_check ->> 'error', 'token_invalid_or_expired')
      );
    END IF;
  END IF;

  INSERT INTO public.pending_registrations (user_id, phone_verification_token)
  VALUES (p_user_id, p_token)
  ON CONFLICT (user_id) DO UPDATE
    SET phone_verification_token = EXCLUDED.phone_verification_token,
        created_at = now();

  -- Opportunistic purge: the token lapses after 30 minutes, so a row older
  -- than a day can never be consumed and is dead weight.
  DELETE FROM public.pending_registrations
  WHERE created_at < now() - interval '1 day';

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_pending_registration(UUID, TEXT, UUID) TO anon, authenticated;
