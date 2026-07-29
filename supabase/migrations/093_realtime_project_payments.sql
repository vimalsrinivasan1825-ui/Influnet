-- Migration 093: Publish project_payments to realtime so payment confirmation
-- events reach the project detail screen without a manual refresh.
--
-- Without this, when a business completes a Razorpay payment, the webhook
-- updates project_payments but the business's browser still shows "pending"
-- until they navigate away and back. Adding the table to the publication means
-- the existing realtime channel in both web and mobile will catch the change
-- and refetch the project data automatically.
--
-- Requires 090_realtime_collab_and_projects.sql (creates the publication) and
-- 091_realtime_project_children.sql (adds child tables) to have been applied.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.project_payments') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'project_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_payments;
  END IF;
END $$;
