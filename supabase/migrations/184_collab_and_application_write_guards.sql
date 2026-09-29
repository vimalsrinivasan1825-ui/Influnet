-- collab_requests_update_participant and the campaign_applications policies
-- have no column limits, so a participant could retarget a request at someone
-- who blocked them, accept their own request, or rewrite an application's
-- creator/campaign. Definer RPCs (accept_*) run as the table owner and are not
-- affected; only direct PostgREST / API-client writes are constrained.
CREATE OR REPLACE FUNCTION public.collab_requests_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    RETURN NEW;
  END IF;

  IF NEW.from_user_id IS DISTINCT FROM OLD.from_user_id
     OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.budget IS DISTINCT FROM OLD.budget THEN
    RAISE EXCEPTION 'collab request fields are immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status::text = 'accepted' AND OLD.status::text <> 'accepted'
     AND auth.uid() IS DISTINCT FROM OLD.to_user_id THEN
    RAISE EXCEPTION 'only the recipient can accept' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collab_requests_guard_write ON public.collab_requests;
CREATE TRIGGER collab_requests_guard_write
  BEFORE INSERT OR UPDATE ON public.collab_requests
  FOR EACH ROW EXECUTE FUNCTION public.collab_requests_guard_write();

CREATE OR REPLACE FUNCTION public.campaign_applications_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'applied';
    NEW.resolved_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
     OR NEW.creator_user_id IS DISTINCT FROM OLD.creator_user_id
     OR NEW.pitch IS DISTINCT FROM OLD.pitch
     OR NEW.proposed_rate IS DISTINCT FROM OLD.proposed_rate THEN
    RAISE EXCEPTION 'application fields are immutable' USING ERRCODE = '42501';
  END IF;

  -- The applicant may only withdraw; shortlist/accept/decline belong to the
  -- campaign owner.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND auth.uid() = OLD.creator_user_id
     AND NEW.status NOT IN ('withdrawn', 'applied') THEN
    RAISE EXCEPTION 'applicants can only withdraw' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_applications_guard_write ON public.campaign_applications;
CREATE TRIGGER campaign_applications_guard_write
  BEFORE INSERT OR UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.campaign_applications_guard_write();
