-- project_change_requests_update had no WITH CHECK and no column limits, so a
-- participant could rewrite proposed_by on their own pending request and then
-- accept it as the "other side" via apply_change_request (whose only consent
-- check reads proposed_by). Freeze the identity/content columns and enforce who
-- may take each transition. Definer RPCs (apply_change_request) run as the
-- table owner and are unaffected; only direct PostgREST callers are constrained.
CREATE OR REPLACE FUNCTION public.change_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.proposed_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'proposed_by must be the caller' USING ERRCODE = '42501';
    END IF;
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.resolved_at := NULL;
    NEW.review_note := NULL;
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.proposed_by IS DISTINCT FROM OLD.proposed_by
     OR NEW.changes IS DISTINCT FROM OLD.changes
     OR NEW.before IS DISTINCT FROM OLD.before
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'change request fields are immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'change request already resolved' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'withdrawn' AND OLD.proposed_by <> auth.uid() THEN
      RAISE EXCEPTION 'only the proposer can withdraw' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IN ('rejected', 'accepted') AND OLD.proposed_by = auth.uid() THEN
      RAISE EXCEPTION 'the proposer cannot resolve their own request' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS change_requests_guard ON public.project_change_requests;
CREATE TRIGGER change_requests_guard
  BEFORE INSERT OR UPDATE ON public.project_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.change_requests_guard();
