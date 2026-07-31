-- Migration 071: A proposal is not a project.
--
-- 069 created the campaign_project immediately in status 'pending_acceptance'
-- and asked the other side to accept it. That was still too early: an
-- un-agreed deal showed up as a real project — in the projects list, in the
-- workspace with its full 12-stage pipeline, in the conversation sidebar —
-- before anyone had said yes to the terms.
--
-- Now the proposed terms live in `project_proposals`, attached to the
-- conversation. NOTHING is written to campaign_projects until the other side
-- accepts. On acceptance the project is created outright as 'active'.
--
--   request accepted → negotiate in chat
--     → either side proposes terms   (project_proposals, status 'pending')
--     → other side accepts           → campaign_project created, 'active'
--     → other side declines          → proposal closed, keep talking, propose again
--
-- Safe to apply whether or not 069 ran: any project left in
-- 'pending_acceptance' is converted back into a pending proposal below.

-- ---------------------------------------------------------------------------
-- 1. project_proposals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_proposals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collab_request_id uuid NOT NULL REFERENCES public.collab_requests (id) ON DELETE CASCADE,
  conversation_id   uuid REFERENCES public.conversations (id) ON DELETE SET NULL,
  proposed_by       uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  title             text NOT NULL,
  description       text NOT NULL DEFAULT '',
  budget            numeric,
  advance_amount    numeric,
  due_date          date,
  note              text,
  review_note       text,
  project_id        bigint REFERENCES public.campaign_projects (id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

-- At most one live proposal per collaboration — otherwise both sides could
-- propose at once and each accept the other's.
CREATE UNIQUE INDEX IF NOT EXISTS project_proposals_one_pending
  ON public.project_proposals (collab_request_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS project_proposals_conversation_idx
  ON public.project_proposals (conversation_id, created_at DESC);

ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

-- Either party to the underlying collab request may read the proposals.
DROP POLICY IF EXISTS project_proposals_select ON public.project_proposals;
CREATE POLICY project_proposals_select ON public.project_proposals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr
      WHERE cr.id = collab_request_id
        AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())
    )
  );

-- Writes go exclusively through the RPCs below, which enforce who may do what.
REVOKE INSERT, UPDATE, DELETE ON public.project_proposals FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. propose_project() — put terms on the table
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propose_project(
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
    budget, advance_amount, due_date, note
  ) VALUES (
    p_collab_request_id, v_conv, v_actor, trim(p_title), coalesce(p_description, ''),
    p_budget, p_advance_amount, p_due_date, p_note
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

GRANT EXECUTE ON FUNCTION public.propose_project(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. respond_to_proposal() — acceptance is what creates the project
-- ---------------------------------------------------------------------------
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
    collab_request_id, created_by_user_id, accepted_at, proposal_note
  ) VALUES (
    v_owner, v_other, v_prop.title, v_prop.description, v_prop.budget,
    v_prop.advance_amount, v_prop.due_date, 'active', 'collaboration_started',
    v_prop.conversation_id, v_prop.collab_request_id, v_prop.proposed_by,
    now(), v_prop.note
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

-- ---------------------------------------------------------------------------
-- 4. withdraw_proposal() — the proposer changes their mind
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.withdraw_proposal(p_proposal_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prop public.project_proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_prop FROM public.project_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal_not_found'; END IF;
  IF v_prop.proposed_by <> auth.uid() THEN RAISE EXCEPTION 'only_proposer_can_withdraw'; END IF;
  IF v_prop.status <> 'pending' THEN RAISE EXCEPTION 'proposal_not_pending'; END IF;

  UPDATE public.project_proposals
  SET status = 'withdrawn', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_proposal_id;

  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'status', 'withdrawn');
END;
$$;

GRANT EXECUTE ON FUNCTION public.withdraw_proposal(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Convert anything 069 already created back into a proposal
-- ---------------------------------------------------------------------------
INSERT INTO public.project_proposals (
  collab_request_id, conversation_id, proposed_by, status, title, description,
  budget, advance_amount, due_date, note, created_at
)
SELECT
  cp.collab_request_id, cp.conversation_id,
  coalesce(cp.created_by_user_id, cp.owner_user_id), 'pending',
  cp.title, cp.description, cp.budget, cp.advance_amount, cp.due_date,
  cp.proposal_note, cp.created_at
FROM public.campaign_projects cp
WHERE cp.status = 'pending_acceptance'
  AND cp.collab_request_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_proposals pp
    WHERE pp.collab_request_id = cp.collab_request_id AND pp.status = 'pending'
  );

DELETE FROM public.campaign_projects WHERE status = 'pending_acceptance';

-- ---------------------------------------------------------------------------
-- 6. Retire the 069 entry points so nothing can create a half-real project
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_project_from_collab(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TEXT);
DROP FUNCTION IF EXISTS public.respond_to_project_proposal(BIGINT, BOOLEAN, TEXT);
DROP INDEX IF EXISTS public.campaign_projects_pending_idx;
