-- Add collab_requests and campaign_projects to the Supabase Realtime publication.
--
-- Background: migration 047 deliberately recreated `supabase_realtime` with ONLY
-- public.notifications in it, and left a note saying any other table has to be
-- added by a later migration. This is that migration. Until it is applied, the
-- client subscriptions added in apps/web (dashboard/requests, dashboard/projects)
-- and apps/mobile (lib/realtime.ts) simply never receive an event — they degrade
-- to the existing load-on-mount / focus-refetch / 60s-poll behaviour, they do not
-- error.
--
-- ---------------------------------------------------------------------------
-- Why there is no REPLICA IDENTITY FULL here
-- ---------------------------------------------------------------------------
-- An earlier draft of this migration set REPLICA IDENTITY FULL on both tables,
-- on the theory that per-user `filter`s could not match an UPDATE without it.
-- That is not how Supabase Realtime works, and the statements were removed:
--
--   * On INSERT and UPDATE, Realtime evaluates the subscriber's `filter` against
--     the NEW record, which is always present in the WAL regardless of replica
--     identity. `to_user_id=eq.<uid>` and `owner_user_id=eq.<uid>` therefore
--     already work on UPDATE — the events this feature exists for (a request
--     answered, a stage advanced, a project cancelled) all arrive fine.
--
--   * FULL only changes what lands in `payload.old`. Neither client reads the
--     payload: apps/web/src/hooks/use-realtime-refresh.ts and
--     apps/mobile/lib/realtime.ts both treat an event purely as "something
--     changed, re-run the page's own fetch", because the screens render
--     API-shaped rows (joined profiles, derived deal_state) that a raw table
--     row cannot reconstruct. So FULL would have been pure WAL cost for zero
--     gain.
--
--   * FULL cannot rescue DELETE either. Per the Supabase docs you cannot filter
--     DELETE events at all when tracking Postgres Changes, and when RLS is
--     enabled and replica identity is full the `old` record contains ONLY the
--     primary key(s). RLS is enabled on both tables, so a filtered listener can
--     never see a DELETE, with or without FULL.
--
-- That DELETE limitation is what shaped the client design rather than something
-- to work around here. In practice it costs us nothing today: migration 089
-- dropped campaign_projects_delete_participant, so cancellation is a status
-- UPDATE and the only remaining hard-delete on either table is the admin-only
-- policy from 038 (support cleanup). Migration 071 likewise dropped
-- respond_to_project_proposal(), the one function that used to hard-delete a
-- campaign_projects row when a proposal was declined; declining now updates a
-- project_proposals row and no project exists to remove. The clients still keep
-- a non-postgres_changes path to a refetch (see the notifications-derived
-- fallback in use-realtime-refresh.ts and the notifications channel in
-- apps/mobile/lib/realtime.ts) so that an admin cleanup, or simply a missed
-- socket event, still resolves without a manual reload.
--
-- ---------------------------------------------------------------------------
-- RLS implication
-- ---------------------------------------------------------------------------
-- Supabase Realtime re-checks row-level security per subscriber before delivering
-- a postgres_changes payload: a client only ever receives rows it could SELECT
-- itself. So publishing these tables does NOT widen access — it can only ever
-- deliver what the existing SELECT policies already allow.
--
-- The relevant policies (verified, unchanged by this migration):
--   * collab_requests_select_participant  (002_collab_and_messages.sql)
--       USING (auth.uid() = from_user_id OR auth.uid() = to_user_id)
--   * campaign_projects_select_participant (006_campaign_projects.sql)
--       USING (auth.uid() = owner_user_id OR auth.uid() = counterparty_user_id)
--   * plus admin-only SELECT policies from 038_add_admin_role.sql
--
-- Both are strictly participant-scoped, which is precisely the granularity the
-- client filters use, so nothing leaks to a third party.
-- ---------------------------------------------------------------------------

-- The publication is created by 047; guard anyway so this migration is safe to
-- run against a database where it was dropped or never created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS, and errors with
-- "relation is already member of publication" on a re-run, so check first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'collab_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'campaign_projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_projects;
  END IF;
END $$;
