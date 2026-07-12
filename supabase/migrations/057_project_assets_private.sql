-- Migration 057: Lock down the `project-assets` storage bucket
--
-- Migration 020 created `project-assets` as a PUBLIC bucket with permissive
-- storage.objects policies (any SELECT where bucket_id='project-assets', any
-- authenticated INSERT). That means project deliverables are world-readable by
-- URL — a real data-leak risk (audit §3, highest-severity gap #1).
--
-- This migration:
--   1. Flips the bucket to private (public=false), so objects are no longer
--      reachable via unsigned public URLs — only via short-lived signed URLs.
--   2. Replaces the permissive read/insert policies with participant-scoped
--      ones keyed off the object path. Objects MUST be stored under a
--      `<project_id>/<file>` prefix; the policy takes the first path segment
--      (`(storage.foldername(name))[1]`) as the project id and joins to
--      `campaign_projects` to confirm the caller is a participant (owner or
--      counterparty). This mirrors the path-scoped pattern already used by the
--      `avatars` (013) and `profile-photos` (025) buckets.
--
-- NOTE: The application does not yet upload to or render from this bucket
-- (the `project_assets` table stores metadata only, and no write/read path is
-- wired up). Reads, once wired, must use `createSignedUrl` against an RLS-
-- enforced (user-JWT) client, and uploads must write under the `<project_id>/`
-- prefix so these policies apply. This migration only closes the exposure; the
-- app-side signed-URL read and upload paths are tracked separately.

-- ---------------------------------------------------------------------------
-- 1) Make the bucket private
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
  SET public = false
  WHERE id = 'project-assets';

-- ---------------------------------------------------------------------------
-- 2) Participant-scoped storage.objects policies (path prefix = project_id)
-- ---------------------------------------------------------------------------

-- Read: only a participant of the project encoded in the path may read.
DROP POLICY IF EXISTS project_assets_storage_read ON storage.objects;
CREATE POLICY project_assets_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-assets'
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- Insert: only a participant may upload, and only under that project's prefix.
DROP POLICY IF EXISTS project_assets_storage_insert ON storage.objects;
CREATE POLICY project_assets_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-assets'
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- Delete: participants may remove objects under their project's prefix (so a
-- private bucket doesn't accumulate orphaned deliverables once uploads land).
DROP POLICY IF EXISTS project_assets_storage_delete ON storage.objects;
CREATE POLICY project_assets_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-assets'
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id::text = (storage.foldername(name))[1]
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );
