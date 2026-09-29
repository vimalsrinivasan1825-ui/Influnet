-- Projects are only ever created by the accept/deal SECURITY DEFINER RPCs, but
-- campaign_projects_insert_owner let any participant INSERT a row directly with
-- status = 'completed', which then satisfies the reviews insert policy and
-- yields forged ratings on any user. Remove the direct path.
REVOKE INSERT ON public.campaign_projects FROM anon, authenticated;
DROP POLICY IF EXISTS campaign_projects_insert_owner ON public.campaign_projects;

-- reviews_update_own only re-checked the author, so project_id / to_user_id
-- could be rewritten to retarget a review at anyone.
CREATE OR REPLACE FUNCTION public.reviews_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
    OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
  ) THEN
    RAISE EXCEPTION 'review target is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_guard_update ON public.reviews;
CREATE TRIGGER reviews_guard_update
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.reviews_guard_update();
