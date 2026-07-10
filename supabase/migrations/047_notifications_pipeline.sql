CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'collab_request' | 'collab_accepted' | 'collab_declined' | 'project_stage' | 'message'
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,                         -- in-app path, e.g. /dashboard/requests
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Enable Realtime
-- NOTE (Medium 7): This block intentionally drops and recreates supabase_realtime
-- to add only the `notifications` table. This means ONLY `notifications` is in the
-- realtime publication by design. If other tables (messages, collab_requests, etc.)
-- need live updates in future, add a new migration:
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.<table_name>;
-- Do NOT assume other tables fire realtime events — they won't until explicitly added.
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Trigger Functions for Notifications
CREATE OR REPLACE FUNCTION public.handle_new_collab_request()
RETURNS TRIGGER AS $$
DECLARE
  v_business_name TEXT;
BEGIN
  -- Get business name
  SELECT p.name INTO v_business_name FROM public.profiles p WHERE p.id = NEW.from_user_id;
  
  -- Insert notification for the influencer
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.to_user_id,
    'collab_request',
    'New Collaboration Request',
    v_business_name || ' has sent you a collaboration request.',
    '/dashboard/requests'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_update_collab_request()
RETURNS TRIGGER AS $$
DECLARE
  v_influencer_name TEXT;
BEGIN
  IF NEW.status <> OLD.status THEN
    -- Get influencer name
    SELECT p.name INTO v_influencer_name FROM public.profiles p WHERE p.id = NEW.to_user_id;

    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        NEW.from_user_id,
        'collab_accepted',
        'Request Accepted',
        v_influencer_name || ' accepted your collaboration request!',
        '/dashboard/projects'
      );
    ELSIF NEW.status = 'declined' THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        NEW.from_user_id,
        'collab_declined',
        'Request Declined',
        v_influencer_name || ' declined your collaboration request.',
        '/dashboard/requests'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Triggers
DROP TRIGGER IF EXISTS on_collab_request_insert ON public.collab_requests;
CREATE TRIGGER on_collab_request_insert
  AFTER INSERT ON public.collab_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_collab_request();

DROP TRIGGER IF EXISTS on_collab_request_update ON public.collab_requests;
CREATE TRIGGER on_collab_request_update
  AFTER UPDATE OF status ON public.collab_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_update_collab_request();
