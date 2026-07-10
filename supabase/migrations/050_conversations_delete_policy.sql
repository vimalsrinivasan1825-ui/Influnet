-- 050: Add RLS DELETE policy for conversations.
-- The `conversations/[id]` DELETE route was previously calling the Supabase Management API
-- (which requires a personal access token, not a service-role key) to run raw SQL deletes.
-- We replace it with a standard authenticated client delete, which is subject to RLS.
-- This migration adds the missing DELETE policy so that an authenticated participant
-- can delete their own conversation, which cascades to messages + participants via FK.

-- Allow a conversation participant to delete the conversation they are part of.
CREATE POLICY "participant_delete_conversation"
  ON public.conversations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = id
        AND cp.user_id = auth.uid()
    )
  );
