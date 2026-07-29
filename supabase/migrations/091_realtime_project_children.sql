-- Add the project detail page's child tables to the Supabase Realtime publication.
--
-- Follow-on to 090, which added collab_requests and campaign_projects. That
-- covered the list pages and the project row itself — a stage advance, skip,
-- sign-off or cancellation is a campaign_projects UPDATE, so the detail page's
-- stage header goes live on 090 alone. What it did NOT cover is everything that
-- hangs off a project: the stage checklist, the stage update thread and the
-- change-request queue all live in their own tables, and a write to any of them
-- currently reaches the other party only on a manual reload.
--
-- ---------------------------------------------------------------------------
-- Who depends on this
-- ---------------------------------------------------------------------------
--   * apps/web/src/app/dashboard/projects/[id]/page.tsx — one channel watching
--     campaign_projects (id=eq.<project>) plus the three tables below
--     (project_id=eq.<project>), each refreshing only the slices it can
--     invalidate rather than the page's full eight-endpoint load.
--   * apps/mobile/app/projects/[id]/index.tsx and .../stage/[stage].tsx, via the
--     per-project channel in apps/mobile/lib/realtime.ts.
--
-- Both degrade the same way 090's clients did before it was applied: the
-- listeners subscribe successfully and simply never fire, and those parts of the
-- screen keep their existing refetch-on-your-own-action behaviour. Nothing
-- errors, so this migration is safe to apply late.
--
-- ---------------------------------------------------------------------------
-- Why there is no REPLICA IDENTITY FULL here either
-- ---------------------------------------------------------------------------
-- The reasoning in 090 applies unchanged, so it is not repeated in full:
-- Realtime evaluates a subscriber's `filter` against the NEW record, which is in
-- the WAL regardless of replica identity, so `project_id=eq.<id>` already
-- matches on INSERT and UPDATE; FULL only populates `payload.old`, which neither
-- client reads (both treat an event as "something changed, re-run the fetch",
-- because the screens render API-shaped rows); and FULL cannot rescue DELETE,
-- since DELETE events cannot be filtered at all and under RLS the old record
-- carries only the primary key.
--
-- The DELETE limitation is worth naming for one of these three specifically:
-- project_stage_entries supports deleting your own update (the delete policy
-- below), and that delete will NOT reach the other party live. It is the one
-- known gap, it matches how the rest of the feature already behaves, and paying
-- FULL's WAL cost on every row would not close it.
--
-- ---------------------------------------------------------------------------
-- RLS implication
-- ---------------------------------------------------------------------------
-- Realtime re-checks row-level security per subscriber before delivering a
-- postgres_changes payload, so a client only ever receives rows it could SELECT
-- itself. Publishing these tables cannot widen access.
--
-- The relevant policies (verified, unchanged by this migration) are all
-- participant-scoped through the parent project, which is exactly the
-- granularity the client filters use:
--   * project_stage_items_select      (054_project_stage_items.sql)
--   * project_change_requests_select  (063_project_change_requests.sql)
--   * project_stage_entries_select    (064_project_stage_entries.sql)
--       each USING (EXISTS (SELECT 1 FROM campaign_projects p
--                           WHERE p.id = project_id
--                             AND (p.owner_user_id = auth.uid()
--                                  OR p.counterparty_user_id = auth.uid())))
-- ---------------------------------------------------------------------------

-- The publication is created by 047 and re-guarded by 090; guard again so this
-- migration is safe against a database where it was dropped or never created.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS, and errors with
-- "relation is already member of publication" on a re-run, so check first. The
-- table existence check is the second half of the same idea: 054/063/064 create
-- these tables, but a database that skipped one must not fail this migration.
DO $$
BEGIN
  IF to_regclass('public.project_stage_items') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_stage_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stage_items;
  END IF;

  IF to_regclass('public.project_stage_entries') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_stage_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_stage_entries;
  END IF;

  IF to_regclass('public.project_change_requests') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_change_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_change_requests;
  END IF;
END $$;
