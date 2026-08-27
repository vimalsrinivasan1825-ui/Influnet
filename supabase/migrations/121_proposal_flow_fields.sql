-- Migration 130: Extend proposal RPCs with flow fields
--
-- propose_project() and respond_to_proposal() (from 071) need to carry the
-- flow_key, deliverables, start_date, is_barter, and barter_details fields
-- from proposal to project. Both RPCs change signature — grant execute on the
-- new signature and drop the old one in the same migration, or PostgREST will
-- resolve to whichever it finds first.

-- 1. Drop old signatures
DROP FUNCTION IF EXISTS public.propose_project(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT);
DROP FUNCTION IF EXISTS public.respond_to_proposal(UUID, BOOLEAN, TEXT);

-- 2. propose_project() — extended with flow fields
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

  IF EXISTS (SELECT 1 FROM public.campaign_projects
             WHERE collab_request_id = p_collab_request_id) THEN
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

-- 3. respond_to_proposal() — extended to carry flow fields into campaign_projects
CREATE OR REPLACE FUNCTION public.respond_to_proposal(
  p_proposal_id UUID,
  p_accept      BOOLEAN,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop    public.project_proposals%ROWTYPE;
  v_req     public.collab_requests%ROWTYPE;
  v_actor   UUID := auth.uid();
  v_owner   UUID;
  v_other   UUID;
  v_project BIGINT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_prop FROM public.project_proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_prop.status <> 'pending' THEN RAISE EXCEPTION 'proposal_not_pending'; END IF;

  SELECT * INTO v_req FROM public.collab_requests WHERE id = v_prop.collab_request_id;
  IF v_actor <> v_req.from_user_id AND v_actor <> v_req.to_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;
  IF v_prop.proposed_by = v_actor THEN
    RAISE EXCEPTION 'proposer_cannot_respond';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.project_proposals
    SET status = 'declined', review_note = p_note, resolved_at = now(), resolved_by = v_actor
    WHERE id = p_proposal_id;

    RETURN jsonb_build_object(
      'proposal_id', p_proposal_id, 'status', 'declined',
      'notify_user_id', v_prop.proposed_by,
      'conversation_id', v_prop.conversation_id, 'note', p_note
    );
  END IF;

  -- Accepted: the brand always owns the project, whoever proposed it.
  SELECT id INTO v_owner FROM public.profiles
  WHERE id IN (v_req.from_user_id, v_req.to_user_id) AND role = 'business_owner'
  LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'no_business_participant'; END IF;

  v_other := CASE WHEN v_owner = v_req.from_user_id THEN v_req.to_user_id ELSE v_req.from_user_id END;

  INSERT INTO public.campaign_projects (
    owner_user_id, counterparty_user_id, title, description, budget,
    advance_amount, due_date, status, current_stage, conversation_id,
    collab_request_id, created_by_user_id, accepted_at, proposal_note,
    flow_key, deliverables, start_date, is_barter, barter_details
  ) VALUES (
    v_owner, v_other, v_prop.title, v_prop.description, v_prop.budget,
    v_prop.advance_amount, v_prop.due_date, 'active',
    CASE WHEN v_prop.flow_key = 'full' THEN 'collaboration_started' ELSE 'quick_agreement' END,
    v_prop.conversation_id, v_prop.collab_request_id, v_prop.proposed_by,
    now(), v_prop.note,
    v_prop.flow_key, v_prop.deliverables, v_prop.start_date,
    v_prop.is_barter, v_prop.barter_details
  ) RETURNING id INTO v_project;

  UPDATE public.project_proposals
  SET status = 'accepted', project_id = v_project, resolved_at = now(), resolved_by = v_actor
  WHERE id = p_proposal_id;

  RETURN jsonb_build_object(
    'proposal_id', p_proposal_id, 'status', 'accepted',
    'project_id', v_project,
    'notify_user_id', v_prop.proposed_by,
    'conversation_id', v_prop.conversation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_proposal(UUID, BOOLEAN, TEXT) TO authenticated;
