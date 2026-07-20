-- Migration 074: remember the signup welcome card per ACCOUNT, not per browser.
--
-- The "Account created!" card was gated on a localStorage key. That is scoped
-- to one browser profile, so it reappeared on every new device, in a private
-- window, after clearing site data, or simply when the user navigated away
-- instead of clicking "Got it" (the flag was only written by the close button).
-- The result was a first-run card greeting people on ordinary logins.
--
-- The flag belongs with the account, so it follows the user everywhere and is
-- written the moment the card is shown rather than only when it is dismissed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ;

-- Everyone who already has an account has, by definition, finished signing up —
-- so nobody sees a "welcome, your account was created" card retroactively.
UPDATE public.profiles
SET welcome_seen_at = created_at
WHERE welcome_seen_at IS NULL;

-- Migration 070 revoked blanket UPDATE on profiles and re-granted it column by
-- column. This flag is self-service and carries no privilege, so it joins that
-- allow-list; `role` and the verification columns stay locked.
GRANT UPDATE (welcome_seen_at) ON public.profiles TO authenticated;
