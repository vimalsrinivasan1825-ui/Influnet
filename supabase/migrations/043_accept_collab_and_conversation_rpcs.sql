-- 043: RPCs required by Tasks 1.2 / 1.3 route code.
-- The API routes (PATCH /api/collabs, POST /api/conversations) call
-- accept_collab_request(request_id) and get_or_create_conversation(user1_id, user2_id);
-- this migration creates them. Also links campaign_projects to their originating
-- collab request for idempotent acceptance.

-- ---------------------------------------------------------------------------
-- campaign_projects.collab_request_id — provenance + duplicate protection
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS collab_request_id UUID REFERENCES public.collab_requests (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS campaign_projects_collab_request_uniq
  ON public.campaign_projects (collab_request_id)
  WHERE collab_request_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- get_or_create_conversation(user1_id, user2_id) → UUID
-- Reuses an existing 1:1 conversation between the pair, else creates one with
-- both participants in a single transaction. Caller must be one of the pair.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
  user1_id UUID,
  user2_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv UUID;
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> user1_id AND auth.uid() <> user2_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF user1_id = user2_id THEN
    RAISE EXCEPTION 'cannot_converse_with_self';
  END IF;

  SELECT cp1.conversation_id INTO v_conv
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = user1_id AND cp2.user_id = user2_id
  LIMIT 1;

  IF v_conv IS NOT NULL THEN
    RETURN v_conv;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO v_conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv, user1_id), (v_conv, user2_id)
  ON CONFLICT DO NOTHING;

  RETURN v_conv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_collab_request(request_id) → JSONB
-- Atomic acceptance: only the receiver of a pending request may accept.
-- One transaction: update request → ensure conversation → create project
-- (exactly once per request, enforced by the unique index above).
-- Re-accepting an already-accepted request is idempotent.
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
    -- Idempotent: return the already-created project/conversation
    SELECT id, conversation_id INTO v_project_id, v_conv
    FROM public.campaign_projects
    WHERE collab_request_id = request_id
    LIMIT 1;
    RETURN jsonb_build_object(
      'request_id', request_id,
      'status', 'accepted',
      'project_id', v_project_id,
      'conversation_id', v_conv,
      'already_accepted', true
    );
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  UPDATE public.collab_requests
  SET status = 'accepted'
  WHERE id = request_id;

  -- Ensure the conversation between business (from) and creator (to)
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

  INSERT INTO public.campaign_projects (
    owner_user_id, counterparty_user_id, title, description, budget,
    status, current_stage, conversation_id, collab_request_id
  )
  VALUES (
    v_req.from_user_id,
    v_req.to_user_id,
    COALESCE(NULLIF(split_part(v_req.message, E'\n', 1), ''), 'New Collaboration'),
    COALESCE(v_req.message, ''),
    v_req.budget,
    'active',
    'collaboration_started',
    v_conv,
    request_id
  )
  ON CONFLICT (collab_request_id) WHERE collab_request_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_project_id;

  IF v_project_id IS NULL THEN
    SELECT id INTO v_project_id
    FROM public.campaign_projects
    WHERE collab_request_id = request_id;
  END IF;

  RETURN jsonb_build_object(
    'request_id', request_id,
    'status', 'accepted',
    'project_id', v_project_id,
    'conversation_id', v_conv,
    'already_accepted', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_collab_request(UUID) TO authenticated;
