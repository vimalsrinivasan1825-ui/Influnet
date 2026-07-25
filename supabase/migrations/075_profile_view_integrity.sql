-- Migration 075: profile-view analytics integrity.
--
-- record_profile_view() was SECURITY DEFINER and GRANTed to anon. Because
-- Supabase exposes every GRANTed RPC on the public PostgREST endpoint, and the
-- anon key is published in the client bundle by design, ANY unauthenticated
-- caller could hit it directly (bypassing our Next.js server entirely, so
-- app-level rate limiting can't help) with no dedup and no upper bound:
--
--   POST https://<project>.supabase.co/rest/v1/rpc/record_profile_view
--   { "p_influencer_user_id": "<uuid>" }   (looped, with the public anon key)
--
-- Two problems: creators price and pitch themselves on this number, so it's
-- attacker-controlled; and profile_views is an append-only table growing
-- without bound from an unauthenticated endpoint.
--
-- We can't reliably fix this by rate-limiting on IP inside the function: a
-- SECURITY DEFINER function called via PostgREST runs behind Supabase's
-- connection pooler, so inet_client_addr() would return the pooler's address,
-- not the real caller's — there is no trustworthy per-caller identity
-- available at the database layer for an anonymous request. The honest fix is
-- to require the one identity we CAN trust (auth.uid()) and deduplicate on it.
--
-- This does mean a fully logged-out visit is no longer counted at all. That
-- is an acceptable trade: the page already only attributes a view to a
-- business (creator_profile_views) when the viewer is authenticated, so an
-- anonymous visit was never doing more than inflating the raw total anyway.

-- Never count the creator looking at their own profile, and never insert more
-- than once per (creator, viewer) per day.
ALTER TABLE public.profile_views
  ADD COLUMN IF NOT EXISTS viewed_on DATE NOT NULL DEFAULT current_date;

-- The old function counted every view including self-views, with no dedup —
-- so existing data can (and on this project, does) have several rows sharing
-- the same (influencer_user_id, viewer_user_id, viewed_on), which the unique
-- index below would otherwise refuse to create. Collapse each group down to
-- its earliest row before the constraint is added.
DELETE FROM public.profile_views a
USING public.profile_views b
WHERE a.viewer_user_id IS NOT NULL
  AND a.influencer_user_id = b.influencer_user_id
  AND a.viewer_user_id = b.viewer_user_id
  AND a.viewed_on = b.viewed_on
  AND (a.viewed_at > b.viewed_at OR (a.viewed_at = b.viewed_at AND a.id > b.id));

CREATE UNIQUE INDEX IF NOT EXISTS profile_views_daily_uidx
  ON public.profile_views (influencer_user_id, viewer_user_id, viewed_on)
  WHERE viewer_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_profile_view(
  p_influencer_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- The caller must be a real signed-in account, and may only record a view
  -- as themselves — never on behalf of an arbitrary p_viewer_user_id.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id <> v_caller THEN
    RAISE EXCEPTION 'viewer_mismatch';
  END IF;

  -- Never count the creator's own visits to their own profile.
  IF v_caller = p_influencer_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.profile_views (influencer_user_id, viewer_user_id)
  VALUES (p_influencer_user_id, v_caller)
  ON CONFLICT (influencer_user_id, viewer_user_id, viewed_on) DO NOTHING;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'business_owner') THEN
    INSERT INTO public.creator_profile_views (creator_id, business_id, view_count, last_viewed_at)
    VALUES (p_influencer_user_id, v_caller, 1, now())
    ON CONFLICT (creator_id, business_id) DO UPDATE
    SET view_count = public.creator_profile_views.view_count + 1,
        last_viewed_at = now();
  END IF;
END;
$$;

-- Authenticated only — closes the unauthenticated unlimited-write vector.
REVOKE EXECUTE ON FUNCTION public.record_profile_view(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_profile_view(UUID, UUID) TO authenticated;
