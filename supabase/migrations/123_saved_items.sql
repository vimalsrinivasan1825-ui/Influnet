-- Migration 123: Saved items (favourites)
--
-- Polymorphic: brands save creators, creators save campaigns.
-- self-scoped RLS: each user sees only their own saves.

CREATE TABLE IF NOT EXISTS public.saved_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('creator', 'campaign')),
  target_id  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, target_id)
);

ALTER TABLE public.saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_items_self_only ON public.saved_items;
CREATE POLICY saved_items_self_only ON public.saved_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
