-- Function to add a participant to a conversation (bypasses RLS)
-- Used when the current user needs to add another user to a conversation
CREATE OR REPLACE FUNCTION public.add_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (p_conversation_id, p_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_conversation_participant(UUID, UUID) TO authenticated;
