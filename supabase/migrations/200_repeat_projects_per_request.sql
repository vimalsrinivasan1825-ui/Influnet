-- Migration 200: a completed project must not block the next one.
--
-- campaign_projects_collab_request_uniq (043) and the guard in propose_project()
-- (121) both allowed ONE project per collaboration request for ever. So once a
-- pair finished a project, "Propose project terms" failed with
-- project_already_exists and the only way round was a brand-new request.
--
-- Now only a project that is still running (not completed / cancelled) holds
-- the request, which is also what the deal route's `openProject` already
-- assumed when it offered can_propose.

DROP INDEX IF EXISTS public.campaign_projects_collab_request_uniq;
CREATE UNIQUE INDEX campaign_projects_collab_request_uniq
  ON public.campaign_projects (collab_request_id)
  WHERE collab_request_id IS NOT NULL AND status NOT IN ('completed', 'cancelled');

CREATE OR REPLACE FUNCTION public.propose_project(
  p_collab_request_id UUID,
  p_title             TEXT,
  p_description       TEXT DEFAULT '',
  p_budget            NUMERIC DEFAULT NULL,
  p_advance_amount    NUMERIC DEFAULT NULL,
  p_due_date          DATE DEFAULT NULL,
  p_note              TEXT DEFAULT NULL,
  p_flow_key          TEXT DEFAULT 'full',
  p_deliverables      TEXT DEFAULT NULL,
  p_start_date        DATE DEFAULT NULL,
  p_is_barter         BOOLEAN DEFAULT FALSE,
  p_barter_details    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req   public.collab_requests%ROWTYPE;
  v_actor UUID := auth.uid();
  v_conv  UUID;
  v_prop  public.project_proposals%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_req FROM public.collab_requests
  WHERE id = p_collab_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF v_actor <> v_req.from_user_id AND v_actor <> v_req.to_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_req.status <> 'accepted' THEN
    RAISE EXCEPTION 'request_not_accepted';
  END IF;
  IF coalesce(trim(p_title), '') = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;

  -- Validate flow_key
  IF p_flow_key NOT IN ('full', 'short_pay_after', 'short_pay_before') THEN
    RAISE EXCEPTION 'invalid_flow_key';
  END IF;

  -- Short-flow validations
  IF p_flow_key <> 'full' THEN
    -- Short flows require a due_date
    IF p_due_date IS NULL THEN
      RAISE EXCEPTION 'short_flow_requires_due_date';
    END IF;
    -- Short flows require either budget > 0 or barter
    IF (p_budget IS NULL OR p_budget <= 0) AND NOT p_is_barter THEN
      RAISE EXCEPTION 'short_flow_requires_budget_or_barter';
    END IF;
    -- Barter requires barter_details
    IF p_is_barter AND (p_barter_details IS NULL OR trim(p_barter_details) = '') THEN
      RAISE EXCEPTION 'barter_requires_details';
    END IF;
    -- is_barter forces budget = 0
    IF p_is_barter AND p_budget IS NOT NULL AND p_budget > 0 THEN
      RAISE EXCEPTION 'barter_forces_zero_budget';
    END IF;
    -- advance_amount must be null on short flows
    IF p_advance_amount IS NOT NULL THEN
      RAISE EXCEPTION 'short_flow_no_advance';
    END IF;
  END IF;

  -- Only a project still running blocks a new one. A finished or cancelled
  -- project must not stop the same pair from doing another piece of work.
  IF EXISTS (SELECT 1 FROM public.campaign_projects
             WHERE collab_request_id = p_collab_request_id
               AND status NOT IN ('completed', 'cancelled')) THEN
    RAISE EXCEPTION 'project_already_exists';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_proposals
             WHERE collab_request_id = p_collab_request_id AND status = 'pending') THEN
    RAISE EXCEPTION 'proposal_already_pending';
  END IF;

  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_req.from_user_id AND cp2.user_id = v_req.to_user_id
  LIMIT 1;

  INSERT INTO public.project_proposals (
    collab_request_id, conversation_id, proposed_by, title, description,
    budget, advance_amount, due_date, note,
    flow_key, deliverables, start_date, is_barter, barter_details
  ) VALUES (
    p_collab_request_id, v_conv, v_actor, trim(p_title), coalesce(p_description, ''),
    p_budget, p_advance_amount, p_due_date, p_note,
    p_flow_key, p_deliverables, p_start_date, p_is_barter, p_barter_details
  ) RETURNING * INTO v_prop;

  RETURN jsonb_build_object(
    'proposal_id', v_prop.id,
    'status', v_prop.status,
    'conversation_id', v_conv,
    'awaiting_user_id', CASE WHEN v_actor = v_req.from_user_id
                             THEN v_req.to_user_id ELSE v_req.from_user_id END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.propose_project(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT, TEXT, TEXT, DATE, BOOLEAN, TEXT) TO authenticated;
