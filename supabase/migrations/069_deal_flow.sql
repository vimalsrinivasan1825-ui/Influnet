-- Migration 069: Deal flow — separate "we agreed to talk" from "we agreed to work".
--
-- BEFORE: accepting a collab request immediately created a campaign_project
-- (see 043). The two parties were pushed into a live project before they had
-- agreed on scope, budget, or timing.
--
-- AFTER: accepting a collab request only opens the CONVERSATION. The two sides
-- negotiate in chat, and then EITHER of them proposes a project with the terms
-- they settled on. The project is created in 'pending_acceptance' and only
-- becomes 'active' once the OTHER side accepts it.
--
--   request sent → accepted (conversation opens) → negotiate in chat
--     → either side proposes a project (pending_acceptance)
--     → other side accepts → active → stage pipeline runs as before
--
-- Projects created by the old flow are untouched: they are already 'active'
-- with created_by_user_id NULL, and every read path treats NULL as "legacy,
-- already accepted".

-- ---------------------------------------------------------------------------
-- campaign_projects: proposal provenance
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS proposal_note TEXT;

-- Legacy rows were auto-created on accept, so they count as already accepted.
UPDATE public.campaign_projects
SET accepted_at = created_at
WHERE accepted_at IS NULL AND created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS campaign_projects_pending_idx
  ON public.campaign_projects (status)
  WHERE status = 'pending_acceptance';

-- ---------------------------------------------------------------------------
-- accept_collab_request(request_id) → JSONB   [REPLACES the 043 version]
-- Accepting now ONLY flips the status and guarantees a conversation exists.
-- It no longer creates a project. Idempotent on re-accept.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_collab_request(
  request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.collab_requests%ROWTYPE;
  v_conv UUID;
  v_project_id BIGINT;
  v_already BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_req
  FROM public.collab_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> v_req.to_user_id THEN
    RAISE EXCEPTION 'only_receiver_can_accept';
  END IF;

  IF v_req.status = 'accepted' THEN
    v_already := TRUE;
  ELSIF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  ELSE
    UPDATE public.collab_requests
    SET status = 'accepted'
    WHERE id = request_id;
  END IF;

  -- Ensure the conversation between the two parties exists.
  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_req.from_user_id AND cp2.user_id = v_req.to_user_id
  LIMIT 1;

  IF v_conv IS NULL THEN
    INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv, v_req.from_user_id), (v_conv, v_req.to_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Surfaced so the caller can link straight to an existing project if this
  -- request already produced one (legacy rows, or a project proposed later).
  SELECT id INTO v_project_id
  FROM public.campaign_projects
  WHERE collab_request_id = request_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'request_id', request_id,
    'status', 'accepted',
    'conversation_id', v_conv,
    'project_id', v_project_id,
    'already_accepted', v_already
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_collab_request(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_project_from_collab(...) → JSONB
-- EITHER party may propose the project once the request is accepted. The brand
-- is always the project owner (the stage pipeline and payment flows assume
-- owner = payer), regardless of who proposed it.
-- The unique index on collab_request_id keeps this to one project per request.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_project_from_collab(
  p_collab_request_id UUID,
  p_title             TEXT,
  p_description       TEXT DEFAULT '',
  p_budget            NUMERIC DEFAULT NULL,
  p_advance_amount    NUMERIC DEFAULT NULL,
  p_due_date          DATE DEFAULT NULL,
  p_note              TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req      public.collab_requests%ROWTYPE;
  v_actor    UUID := auth.uid();
  v_owner    UUID;
  v_other    UUID;
  v_conv     UUID;
  v_existing BIGINT;
  v_project  public.campaign_projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_req
  FROM public.collab_requests
  WHERE id = p_collab_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_actor <> v_req.from_user_id AND v_actor <> v_req.to_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  -- Both sides must have agreed to talk before a project can exist.
  IF v_req.status <> 'accepted' THEN
    RAISE EXCEPTION 'request_not_accepted';
  END IF;

  SELECT id INTO v_existing
  FROM public.campaign_projects
  WHERE collab_request_id = p_collab_request_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'project_already_exists';
  END IF;

  IF coalesce(trim(p_title), '') = '' THEN
    RAISE EXCEPTION 'title_required';
  END IF;

  -- Owner must be the business owner whichever direction the request went.
  SELECT id INTO v_owner
  FROM public.profiles
  WHERE id IN (v_req.from_user_id, v_req.to_user_id)
    AND role = 'business_owner'
  LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'no_business_participant';
  END IF;

  v_other := CASE WHEN v_owner = v_req.from_user_id THEN v_req.to_user_id ELSE v_req.from_user_id END;

  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_req.from_user_id AND cp2.user_id = v_req.to_user_id
  LIMIT 1;

  INSERT INTO public.campaign_projects (
    owner_user_id, counterparty_user_id, title, description, budget,
    advance_amount, due_date, status, current_stage, conversation_id,
    collab_request_id, created_by_user_id, proposal_note
  )
  VALUES (
    v_owner, v_other, trim(p_title), coalesce(p_description, ''), p_budget,
    p_advance_amount, p_due_date, 'pending_acceptance', 'collaboration_started',
    v_conv, p_collab_request_id, v_actor, p_note
  )
  RETURNING * INTO v_project;

  RETURN jsonb_build_object(
    'project_id', v_project.id,
    'status', v_project.status,
    'owner_user_id', v_project.owner_user_id,
    'counterparty_user_id', v_project.counterparty_user_id,
    'created_by_user_id', v_project.created_by_user_id,
    'conversation_id', v_conv,
    'awaiting_user_id', CASE WHEN v_actor = v_owner THEN v_other ELSE v_owner END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_project_from_collab(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- respond_to_project_proposal(project_id, accept, note) → JSONB
-- Only the participant who did NOT propose the project may respond.
-- accept → 'active' (the stage pipeline takes over).
-- decline → the proposal row is deleted so the pair can propose fresh terms
--           after talking it through; the collab request stays accepted so the
--           conversation and the "Create project" button remain available.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_project_proposal(
  p_project_id BIGINT,
  p_accept     BOOLEAN,
  p_note       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_project public.campaign_projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_project
  FROM public.campaign_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  IF v_actor <> v_project.owner_user_id AND v_actor <> v_project.counterparty_user_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  IF v_project.status <> 'pending_acceptance' THEN
    RAISE EXCEPTION 'project_not_pending';
  END IF;

  IF v_project.created_by_user_id = v_actor THEN
    RAISE EXCEPTION 'proposer_cannot_respond';
  END IF;

  IF p_accept THEN
    UPDATE public.campaign_projects
    SET status = 'active',
        accepted_at = now(),
        updated_at = now()
    WHERE id = p_project_id;

    RETURN jsonb_build_object(
      'project_id', p_project_id,
      'status', 'active',
      'notify_user_id', v_project.created_by_user_id,
      'conversation_id', v_project.conversation_id
    );
  END IF;

  DELETE FROM public.campaign_projects WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'status', 'declined',
    'deleted', true,
    'notify_user_id', v_project.created_by_user_id,
    'conversation_id', v_project.conversation_id,
    'collab_request_id', v_project.collab_request_id,
    'note', p_note
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_project_proposal(BIGINT, BOOLEAN, TEXT) TO authenticated;
