-- Migration 143: respond_to_proposal() must not insert NULL deliverables
--
-- Pre-existing bug, since migration 121. `campaign_projects.deliverables` is
-- `TEXT NOT NULL DEFAULT ''` (migration 020). Migration 119 tried to make it
-- nullable to match `project_proposals.deliverables` — but `ADD COLUMN IF NOT
-- EXISTS` is a no-op when the column already exists, so the NOT NULL stayed.
--
-- respond_to_proposal() (migration 121) then carries `v_prop.deliverables`
-- straight into the INSERT. Deliverables are OPTIONAL in the propose form
-- (ProposeSchema in apps/web/.../deal/route.ts), so a proposal with none has
-- `deliverables = NULL`, and accepting it fails with:
--
--   null value in column "deliverables" of relation "campaign_projects"
--   violates not-null constraint   (SQLSTATE 23502)
--
-- surfacing to the user as a 500 "Could not respond to the terms". The
-- matchmaking E2E test (apps/web/tests/matchmaking.js) hits this exact path.
--
-- Fix: COALESCE to '' in the INSERT — the same value the column default would
-- have supplied, and what every reader already treats a missing deliverables
-- as (`|| ''`, `?? ''`, `&&`). The column stays NOT NULL; nothing downstream
-- changes. This is the ONLY line that differs from migration 121's definition.

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
    v_prop.flow_key, COALESCE(v_prop.deliverables, ''), v_prop.start_date,
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
