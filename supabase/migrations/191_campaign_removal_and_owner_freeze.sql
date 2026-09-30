-- Migration 191: an admin-removed campaign must stay removed, and ownership is fixed.
-- campaigns_update lets the owner write any column, so an owner could flip a
-- 'removed' campaign back to 'live' or hand it to another business.
-- SECURITY INVOKER on purpose: current_user is the caller, so the service role
-- and definer RPCs (admin removal) pass through untouched.

CREATE OR REPLACE FUNCTION public.campaigns_guard_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.business_user_id IS DISTINCT FROM OLD.business_user_id THEN
    RAISE EXCEPTION 'campaign_owner_immutable';
  END IF;

  IF OLD.status = 'removed' AND NEW.status IS DISTINCT FROM 'removed' THEN
    RAISE EXCEPTION 'campaign_removed_by_admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaigns_guard_update_trg ON public.campaigns;
CREATE TRIGGER campaigns_guard_update_trg
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.campaigns_guard_update();
