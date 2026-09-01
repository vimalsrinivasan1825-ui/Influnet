-- Migration 140: cap pinned conversations on Free (3), unlimited on Pro
--
-- conversation_pins was created in migration 138 (store + RLS only). This adds
-- the quota — a standing count, so a BEFORE INSERT trigger is the right tool,
-- the same shape as enforce_project_quota / enforce_campaign_quota:
--   • off unless db_enforcement_enabled
--   • Pro (non-free) exempt
--   • advisory lock per user so two pin taps landing together can't both pass
--
-- free_pinned_chats (migration 138) defaults to 3. NULL there would mean
-- "no limit", same convention as everywhere else.

CREATE OR REPLACE FUNCTION public.enforce_pin_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_limit   INTEGER;
  v_count   INTEGER;
BEGIN
  SELECT db_enforcement_enabled, free_pinned_chats
    INTO v_enabled, v_limit
  FROM public.billing_settings WHERE id;

  IF NOT COALESCE(v_enabled, FALSE) THEN RETURN NEW; END IF;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  IF public.current_tier(NEW.user_id) <> 'free' THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('pin_quota:' || NEW.user_id::TEXT));

  SELECT count(*) INTO v_count
  FROM public.conversation_pins
  WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    -- Mapped by the API to a 402. Kept machine-readable because the route
    -- matches on it.
    RAISE EXCEPTION 'pin_quota_exceeded';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pin_quota_trg ON public.conversation_pins;
CREATE TRIGGER enforce_pin_quota_trg
  BEFORE INSERT ON public.conversation_pins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pin_quota();
