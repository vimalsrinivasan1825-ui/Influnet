-- Blocking was enforced only on collab_requests INSERT (076), so a blocked user
-- could still open a conversation with the blocker through
-- get_or_create_conversation / ensure_conversation and message them. Enforce it
-- where the membership is created, which covers every RPC and direct write.
CREATE OR REPLACE FUNCTION public.conversation_participants_guard_blocks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.user_id <> NEW.user_id
      AND public.is_blocked_pair(cp.user_id, NEW.user_id)
  ) THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversation_participants_guard_blocks ON public.conversation_participants;
CREATE TRIGGER conversation_participants_guard_blocks
  BEFORE INSERT ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.conversation_participants_guard_blocks();

-- Unused by the app, callable by any signed-in user, and it adds an arbitrary
-- user to any conversation with no membership check.
REVOKE ALL ON FUNCTION public.add_conversation_participant(UUID, UUID) FROM PUBLIC, anon, authenticated;
