-- Migration 065: Add advance_amount to collab_requests and campaign_projects

ALTER TABLE public.collab_requests ADD COLUMN IF NOT EXISTS advance_amount NUMERIC;
ALTER TABLE public.campaign_projects ADD COLUMN IF NOT EXISTS advance_amount NUMERIC;

-- Update the accept_collab_request function to also copy advance_amount
-- It's defined in 043_accept_collab_and_conversation_rpcs.sql

CREATE OR REPLACE FUNCTION public.accept_collab_request(
  request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req public.collab_requests%ROWTYPE;
  v_conv UUID;
  v_project_id BIGINT;
BEGIN
  SELECT * INTO v_req
  FROM public.collab_requests
  WHERE id = request_id;

  IF v_req IS NULL THEN
    RAISE EXCEPTION 'request_not_found';
  END IF;

  IF v_req.to_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF v_req.status = 'accepted' THEN
    SELECT id INTO v_project_id
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
    owner_user_id, counterparty_user_id, title, description, budget, advance_amount,
    status, current_stage, conversation_id, collab_request_id
  )
  VALUES (
    v_req.from_user_id,
    v_req.to_user_id,
    COALESCE(NULLIF(split_part(v_req.message, E'\n', 1), ''), 'New Collaboration'),
    COALESCE(v_req.message, ''),
    v_req.budget,
    v_req.advance_amount,
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
