-- Add project_proposals to the Supabase Realtime publication.
--
-- Background: migration 090 published collab_requests and campaign_projects so
-- the chat deal card could wake up when the other side acted. It missed the
-- table the deal card actually spends most of its life watching: a proposal is
-- accepted, declined or withdrawn as an UPDATE to project_proposals.status,
-- and campaign_projects only gains a new row on ACCEPT. Decline and withdraw
-- touch project_proposals alone — a table this publication never included —
-- so no client-side subscription could ever see those two actions, no matter
-- how the mobile/web screens were wired. Confirmed live on the dev DB before
-- writing this: project_proposals was absent from pg_publication_tables while
-- collab_requests and campaign_projects were both present.
--
-- ---------------------------------------------------------------------------
-- Why the client filters on conversation_id, not a per-user column
-- ---------------------------------------------------------------------------
-- collab_requests/campaign_projects both carry the two participants as direct
-- columns (from_user_id/to_user_id, owner_user_id/counterparty_user_id), so
-- 090's clients filter with `eq.<viewer's own id>`. project_proposals has no
-- such column — the only party recorded directly on the row is proposed_by,
-- the person who SENT the terms. A filter on proposed_by therefore only ever
-- reaches the proposer's own subscription; the recipient's user id never
-- appears anywhere on the row, so proposed_by=eq.<recipient> can never match.
-- That is precisely the withdraw case this migration exists for: withdrawing
-- is only ever done by the proposer (see withdraw_proposal's own check), and
-- it is the OTHER party's screen — the one that never appears as proposed_by
-- on that row — that needs to see the proposal disappear.
--
-- The column every row DOES carry both parties through is conversation_id
-- (set by propose_project from the pair's shared conversation), and the two
-- clients already know it: it is the very id the chat screen is open on. So
-- the fix filters project_proposals on conversation_id=eq.<the open
-- conversation>, scoped per-screen (like the mobile project detail screen's
-- per-project channel) rather than per-user-across-the-app like 090's tables.
--
-- ---------------------------------------------------------------------------
-- RLS implication (same backstop as migration 090)
-- ---------------------------------------------------------------------------
-- Supabase Realtime re-checks row-level security per subscriber before
-- delivering a postgres_changes payload — a client only ever receives rows it
-- could SELECT itself, regardless of how loose the coarse `filter` is. So a
-- conversation_id filter is not "anyone who knows the UUID can listen in": the
-- existing policy below still has the final say.
--
--   * project_proposals_select (071_project_proposals.sql)
--       USING (EXISTS (SELECT 1 FROM collab_requests cr
--                       WHERE cr.id = collab_request_id
--                         AND (cr.from_user_id = auth.uid() OR cr.to_user_id = auth.uid())))
--
-- That is participant-scoped on the underlying request, same granularity as
-- 090's policies, so publishing this table widens nothing.
--
-- Same DELETE limitation as 090, and same reason it doesn't matter here:
-- withdraw_proposal and respond_to_proposal both UPDATE status in place
-- (checked directly against their definitions in 071) — no code path deletes
-- a project_proposals row outside its collab_request's own CASCADE.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS, and errors with
-- "relation is already member of publication" on a re-run, so check first —
-- same guard 090 uses.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_proposals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_proposals;
  END IF;
END $$;
