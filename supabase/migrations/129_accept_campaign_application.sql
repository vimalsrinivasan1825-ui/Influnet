-- Migration 129: accept_campaign_application() RPC
--
-- When a brand accepts a campaign application, this materializes a
-- collab_requests row in 'accepted' status, creates a conversation, and
-- sets the application to 'accepted'. Everything downstream is the normal
-- deal flow — propose terms in chat, accept, create project.

CREATE OR REPLACE FUNCTION public.accept_campaign_application(
  p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     public.campaign_applications%ROWTYPE;
  v_campaign public.campaigns%ROWTYPE;
  v_actor   UUID := auth.uid();
  v_request public.collab_requests%ROWTYPE;
  v_conv_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_app FROM public.campaign_applications
  WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application_not_found'; END IF;

  SELECT * INTO v_campaign FROM public.campaigns
  WHERE id = v_app.campaign_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;

  -- Only the campaign owner can accept
  IF v_campaign.business_user_id <> v_actor THEN
    RAISE EXCEPTION 'not_campaign_owner';
  END IF;

  -- Campaign must be live
  IF v_campaign.status <> 'live' THEN
    RAISE EXCEPTION 'campaign_not_live';
  END IF;

  -- Application must be in a state that can be accepted
  IF v_app.status NOT IN ('applied', 'shortlisted') THEN
    RAISE EXCEPTION 'application_not_acceptable';
  END IF;

  -- Check for existing request between this pair
  SELECT * INTO v_request FROM public.collab_requests
  WHERE from_user_id = v_campaign.business_user_id
    AND to_user_id = v_app.creator_user_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_request.id IS NULL THEN
    -- No existing request: create a new accepted one
    INSERT INTO public.collab_requests (
      from_user_id, to_user_id, status, message, budget, created_at
    ) VALUES (
      v_campaign.business_user_id,
      v_app.creator_user_id,
      'accepted',
      v_campaign.title,
      v_app.proposed_rate,
      now()
    ) RETURNING * INTO v_request;
  ELSIF v_request.status = 'pending' THEN
    -- Pending request from brand to creator: accept it directly
    UPDATE public.collab_requests
    SET status = 'accepted', message = v_campaign.title, budget = v_app.proposed_rate
    WHERE id = v_request.id
    RETURNING * INTO v_request;
  END IF;

  -- Get or create conversation
  v_conv_id := public.get_or_create_conversation(
    v_campaign.business_user_id,
    v_app.creator_user_id
  );

  -- Mark application as accepted
  UPDATE public.campaign_applications
  SET status = 'accepted', resolved_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'conversation_id', v_conv_id,
    'collab_request_id', v_request.id,
    'campaign_title', v_campaign.title
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_campaign_application(UUID) TO authenticated;
