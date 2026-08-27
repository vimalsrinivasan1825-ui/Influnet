-- Migration 125: Campaigns
--
-- Business owners publish campaigns that creators can browse and apply to.
-- A settings flag decides whether new campaigns land in 'draft' or
-- 'pending_review' (Q5).

CREATE TABLE IF NOT EXISTS public.campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                 text NOT NULL,
  description           text NOT NULL DEFAULT '',
  deliverables          text NOT NULL DEFAULT '',
  platforms             text[] NOT NULL DEFAULT '{}',
  budget_min            numeric,
  budget_max            numeric,
  currency              text NOT NULL DEFAULT 'INR',
  starts_on             date,
  delivery_by           date,
  applications_close_at timestamptz,
  follower_min          integer,
  follower_max          integer,
  categories            text[] NOT NULL DEFAULT '{}',
  location              text,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'pending_review', 'live', 'closed', 'expired', 'removed')),
  published_at          timestamptz,
  expires_at            timestamptz,
  removed_reason        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- SELECT live campaigns to any authenticated user (not expired, not removed)
DROP POLICY IF EXISTS campaigns_select_live ON public.campaigns;
CREATE POLICY campaigns_select_live ON public.campaigns
  FOR SELECT TO authenticated
  USING (
    status = 'live'
    AND (expires_at IS NULL OR expires_at > now())
  );

-- SELECT own rows in any state to the owning business
DROP POLICY IF EXISTS campaigns_select_own ON public.campaigns;
CREATE POLICY campaigns_select_own ON public.campaigns
  FOR SELECT TO authenticated
  USING (business_user_id = auth.uid());

-- INSERT only by the owner (approval gate enforced server-side in the route)
DROP POLICY IF EXISTS campaigns_insert ON public.campaigns;
CREATE POLICY campaigns_insert ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (business_user_id = auth.uid());

-- UPDATE only by the owner
DROP POLICY IF EXISTS campaigns_update ON public.campaigns;
CREATE POLICY campaigns_update ON public.campaigns
  FOR UPDATE TO authenticated
  USING (business_user_id = auth.uid());
