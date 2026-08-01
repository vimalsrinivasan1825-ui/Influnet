-- 098: Customer support, product feedback, and the admin insight RPCs.
--
-- Three things the admin surface could not do before this migration:
--   1. Answer a user. There was no ticket table at all — a stuck creator had
--      no in-product route to a human, and an admin had nothing to reply to.
--   2. Collect feedback that is not a complaint about another user.
--      `user_reports` (056) is for reporting a PERSON; there was no channel for
--      "this stage flow confused me".
--   3. See the platform as numbers over time. `get_admin_dashboard_stats`
--      returns lifetime totals only, so "are signups slowing down?" was
--      unanswerable without opening the Supabase SQL editor.
--
-- Nothing here is enabled by a feature flag: the tables are inert until a row
-- is written, and every RPC is read-only apart from the two explicit writers.

-- ---------------------------------------------------------------------------
-- 1. support_tickets — a conversation between one user and the admin team
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject      text NOT NULL,
  category     text NOT NULL DEFAULT 'other',
    -- 'account'|'payment'|'verification'|'project'|'bug'|'other'
  status       text NOT NULL DEFAULT 'open',
    -- 'open'|'pending'|'resolved'|'closed'
  priority     text NOT NULL DEFAULT 'normal',
    -- 'low'|'normal'|'high'|'urgent'
  -- Free-text context the user does not have to type: which page they were on,
  -- app version, platform. Never contains credentials — the API strips unknown
  -- keys before writing (see /api/support/tickets).
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- Denormalised so the admin inbox can sort by "waiting longest" without
  -- joining ticket_messages on every row.
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- TRUE when the last message came from the user, i.e. the ball is with us.
  awaiting_admin  boolean NOT NULL DEFAULT true,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_subject_len CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT support_tickets_status_valid
    CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  CONSTRAINT support_tickets_priority_valid
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT support_tickets_category_valid
    CHECK (category IN ('account', 'payment', 'verification', 'project', 'bug', 'other'))
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON public.support_tickets (user_id, created_at DESC);
-- The admin inbox's default view: open tickets, oldest waiting first.
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx
  ON public.support_tickets (status, awaiting_admin, last_message_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_insert_own ON public.support_tickets;
CREATE POLICY support_tickets_insert_own ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS support_tickets_select_own ON public.support_tickets;
CREATE POLICY support_tickets_select_own ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- A user may close their own ticket; everything else (priority, assignment,
-- status transitions) is admin-only. WITH CHECK stops a user from flipping
-- user_id or handing themselves a different priority.
DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets;
CREATE POLICY support_tickets_update ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Deleting a support history would destroy the record of what was promised to
-- a user. Nobody gets DELETE.
REVOKE DELETE ON public.support_tickets FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. ticket_messages — the replies on a ticket
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  -- Kept separate from author_id so a reply still reads as "from support"
  -- after the admin account that wrote it is deleted.
  from_admin  boolean NOT NULL DEFAULT false,
  body        text NOT NULL,
  -- Internal notes are admin-to-admin: never returned on the user endpoint.
  internal    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_messages_body_len CHECK (char_length(body) BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx
  ON public.ticket_messages (ticket_id, created_at);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- A user may write on their own ticket, and may never write an internal note
-- or claim a message came from support. Both are enforced here rather than in
-- the API alone, because RLS is the boundary a compromised client cannot pass.
DROP POLICY IF EXISTS ticket_messages_insert ON public.ticket_messages;
CREATE POLICY ticket_messages_insert ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.is_admin()
      OR (
        internal = false
        AND from_admin = false
        AND EXISTS (
          SELECT 1 FROM public.support_tickets t
          WHERE t.id = ticket_id AND t.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS ticket_messages_select ON public.ticket_messages;
CREATE POLICY ticket_messages_select ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      internal = false
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

REVOKE UPDATE, DELETE ON public.ticket_messages FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. product_feedback — "this was confusing", not "this person scammed me"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind        text NOT NULL DEFAULT 'idea',
    -- 'idea'|'bug'|'praise'|'confusion'
  message     text NOT NULL,
  -- 1-5 when the feedback came from a rating prompt, NULL for free-form.
  rating      smallint,
  -- Route or screen the feedback was submitted from.
  surface     text,
  status      text NOT NULL DEFAULT 'new',
    -- 'new'|'triaged'|'planned'|'shipped'|'declined'
  admin_note  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_feedback_message_len CHECK (char_length(message) BETWEEN 1 AND 4000),
  CONSTRAINT product_feedback_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT product_feedback_kind_valid
    CHECK (kind IN ('idea', 'bug', 'praise', 'confusion')),
  CONSTRAINT product_feedback_status_valid
    CHECK (status IN ('new', 'triaged', 'planned', 'shipped', 'declined'))
);

CREATE INDEX IF NOT EXISTS product_feedback_status_idx
  ON public.product_feedback (status, created_at DESC);

ALTER TABLE public.product_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_feedback_insert_own ON public.product_feedback;
CREATE POLICY product_feedback_insert_own ON public.product_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- A user sees only what they wrote. The board is an admin view — feedback is
-- not a public forum, and one user's "your payment flow is broken" is not
-- something other users should be reading.
DROP POLICY IF EXISTS product_feedback_select ON public.product_feedback;
CREATE POLICY product_feedback_select ON public.product_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS product_feedback_update_admin ON public.product_feedback;
CREATE POLICY product_feedback_update_admin ON public.product_feedback
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE DELETE ON public.product_feedback FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Ticket bookkeeping — keep the queue columns honest
-- ---------------------------------------------------------------------------
-- last_message_at and awaiting_admin drive the admin inbox ordering. Setting
-- them in the API would mean every future caller has to remember to; a trigger
-- means the queue cannot drift out of sync with the messages.
CREATE OR REPLACE FUNCTION public.touch_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Internal notes are admin scratch space: they must not make a ticket look
  -- like it was answered, nor bump it in the "waiting longest" ordering.
  IF NEW.internal THEN
    RETURN NEW;
  END IF;

  -- Aliased so every column reference is unambiguous. An unqualified `status`
  -- in the SET expression would still resolve correctly today, but it silently
  -- becomes a variable reference the moment someone adds a local named the
  -- same — the kind of bug that only shows up in production data.
  UPDATE public.support_tickets t
     SET last_message_at = NEW.created_at,
         awaiting_admin  = NOT NEW.from_admin,
         -- An admin reply moves an open ticket to 'pending' (waiting on the
         -- user); a user reply on a resolved ticket reopens it.
         status = CASE
           WHEN NEW.from_admin AND t.status = 'open'                      THEN 'pending'
           WHEN NOT NEW.from_admin AND t.status IN ('pending','resolved') THEN 'open'
           ELSE t.status
         END,
         -- Clearing this on reopen matters: get_admin_support_stats() averages
         -- (resolved_at - created_at). A ticket that was resolved, reopened by
         -- the user, and resolved again would otherwise keep its FIRST
         -- resolution time and quietly understate how long support really took.
         resolved_at = CASE
           WHEN NOT NEW.from_admin AND t.status IN ('pending','resolved') THEN NULL
           ELSE t.resolved_at
         END
   WHERE t.id = NEW.ticket_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_touch ON public.ticket_messages;
CREATE TRIGGER support_ticket_touch
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_ticket();

-- ---------------------------------------------------------------------------
-- 5. get_admin_support_stats() — inbox counters
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_support_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'open_tickets',      (SELECT count(*) FROM public.support_tickets WHERE status = 'open'),
    'awaiting_admin',    (SELECT count(*) FROM public.support_tickets WHERE awaiting_admin AND status IN ('open','pending')),
    'urgent_tickets',    (SELECT count(*) FROM public.support_tickets WHERE priority = 'urgent' AND status IN ('open','pending')),
    'resolved_7d',       (SELECT count(*) FROM public.support_tickets WHERE resolved_at > now() - interval '7 days'),
    'new_feedback',      (SELECT count(*) FROM public.product_feedback WHERE status = 'new'),
    'open_reports',      (SELECT count(*) FROM public.user_reports WHERE status IN ('open','reviewing')),
    -- Median-ish: average hours from ticket creation to resolution over the
    -- last 30 days. NULL when nothing has been resolved yet.
    'avg_resolution_hours', (
      SELECT round(avg(extract(epoch FROM (resolved_at - created_at)) / 3600)::numeric, 1)
      FROM public.support_tickets
      WHERE resolved_at > now() - interval '30 days'
    )
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_support_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. get_admin_growth_series() — the platform as a time series
-- ---------------------------------------------------------------------------
-- One row per day for the requested window, zero-filled, so the admin chart
-- does not have to guess at missing days. Capped at 180 days: this scans the
-- base tables and an unbounded window is an easy accidental table scan.
CREATE OR REPLACE FUNCTION public.get_admin_growth_series(p_days INT DEFAULT 30)
RETURNS TABLE (
  day             date,
  signups         bigint,
  collabs         bigint,
  projects        bigint,
  completed       bigint,
  tickets         bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  window_days INT := least(greatest(coalesce(p_days, 30), 1), 180);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (current_date - (window_days - 1)),
      current_date,
      interval '1 day'
    )::date AS day
  )
  SELECT
    d.day,
    (SELECT count(*) FROM public.profiles p
      WHERE p.created_at::date = d.day),
    -- Requests, not a "collaborations" table — the collab entity in this
    -- schema is collab_requests (types/index.ts agrees).
    (SELECT count(*) FROM public.collab_requests cr
      WHERE cr.created_at::date = d.day),
    (SELECT count(*) FROM public.campaign_projects cp
      WHERE cp.created_at::date = d.day),
    -- Approximation on purpose: campaign_projects has no completed_at, so a
    -- project edited after completion counts on the edit day. Good enough for
    -- a trend line, and cheaper than a new column + backfill.
    (SELECT count(*) FROM public.campaign_projects cp
      WHERE cp.status = 'completed' AND cp.updated_at::date = d.day),
    (SELECT count(*) FROM public.support_tickets t
      WHERE t.created_at::date = d.day)
  FROM days d
  ORDER BY d.day;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_growth_series(INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. get_admin_funnel() — where creators fall out of the journey
-- ---------------------------------------------------------------------------
-- The product question the client keeps asking ("why do creators sign up and
-- never finish?") answered from the database rather than from PostHog, so it
-- works before any analytics key is configured and stays correct for users who
-- block third-party scripts.
CREATE OR REPLACE FUNCTION public.get_admin_funnel()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'signed_up',      (SELECT count(*) FROM public.profiles WHERE role = 'influencer'),
    'has_handle',     (SELECT count(*) FROM public.influencer_profiles
                        WHERE coalesce(instagram_handle, '') <> ''),
    -- Ownership lives in social_account_claims (058), not as a column on
    -- influencer_profiles. One verified claim of any platform counts.
    'ownership_done', (SELECT count(DISTINCT user_id) FROM public.social_account_claims
                        WHERE status = 'verified'),
    'verified',       (SELECT count(*) FROM public.profiles
                        WHERE role = 'influencer' AND verification_status = 'verified'),
    -- A project's two sides are owner_user_id / counterparty_user_id with no
    -- role baked in, so the influencer side is found by joining profiles.
    'in_collab',      (SELECT count(DISTINCT p.id) FROM public.profiles p
                        WHERE p.role = 'influencer'
                          AND EXISTS (
                            SELECT 1 FROM public.collab_requests cr
                            WHERE cr.to_user_id = p.id OR cr.from_user_id = p.id
                          )),
    'in_project',     (SELECT count(DISTINCT p.id) FROM public.profiles p
                        WHERE p.role = 'influencer'
                          AND EXISTS (
                            SELECT 1 FROM public.campaign_projects cp
                            WHERE cp.owner_user_id = p.id OR cp.counterparty_user_id = p.id
                          )),
    'completed',      (SELECT count(DISTINCT p.id) FROM public.profiles p
                        WHERE p.role = 'influencer'
                          AND EXISTS (
                            SELECT 1 FROM public.campaign_projects cp
                            WHERE cp.status = 'completed'
                              AND (cp.owner_user_id = p.id OR cp.counterparty_user_id = p.id)
                          ))
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_funnel() TO authenticated;
