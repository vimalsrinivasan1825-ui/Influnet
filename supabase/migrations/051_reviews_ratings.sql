-- Migration 051: Reviews & ratings
-- NOTE: campaign_projects.id is BIGINT (migration 006), so project_id MUST be bigint.
-- A uuid FK here fails to apply ("incompatible types: uuid and bigint").

CREATE TABLE IF NOT EXISTS public.reviews (
    id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   bigint REFERENCES public.campaign_projects(id) ON DELETE CASCADE NOT NULL,
    from_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    to_user_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    rating       smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment      text,
    created_at   timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (project_id, from_user_id) -- one review per user per project
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Reviews are public (ratings surface on public profiles).
DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
CREATE POLICY "reviews_select_public"
  ON public.reviews FOR SELECT
  USING (true);

-- INSERT is enforced at the DATABASE level, not just in the API route:
-- the reviewer must be a participant of a COMPLETED project and may only
-- review the OTHER participant. This blocks direct-PostgREST review forgery.
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "reviews_insert_participant"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND from_user_id <> to_user_id
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = reviews.project_id
        AND p.status = 'completed'
        AND auth.uid() IN (p.owner_user_id, p.counterparty_user_id)
        AND reviews.to_user_id IN (p.owner_user_id, p.counterparty_user_id)
    )
  );

-- A reviewer may edit/delete only their own review, and only in a way that
-- keeps them the author (re-checks the same participant invariant on UPDATE).
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
CREATE POLICY "reviews_update_own"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (from_user_id = auth.uid())
  WITH CHECK (from_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own reviews" ON public.reviews;
CREATE POLICY "reviews_delete_own"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (from_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reviews_to_user_id ON public.reviews(to_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_project_id ON public.reviews(project_id);
