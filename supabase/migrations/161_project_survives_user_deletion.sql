-- Migration 161: a finished project must survive either party deleting their account
--
-- THE BUG THIS FIXES (F2, launch audit 2026-09-18)
--
-- campaign_projects.owner_user_id and .counterparty_user_id were
-- ON DELETE CASCADE (006). Deleting an account — self-service DELETE
-- /api/profile or admin DELETE /api/admin/users/[id] — runs
-- auth.admin.deleteUser(), whose cascade reached the project row and took
-- with it everything that cascades from the project:
--
--   project_payments      (059)  the payment ledger
--   project_documents     (124)  receipts and tax invoices
--   project_stage_items   (054)  the signed-off checklist
--   project_stage_entries (064)  delivered work
--   reviews (051), project_activity (062), project_change_requests (063)…
--
-- So when EITHER person deleted their account, BOTH lost every record of
-- work they were paid for — including the invoices Indian tax law and the
-- draft terms require the surviving party to keep.
--
-- THE FIX
--
-- The project is a SHARED record, so neither participant's death may destroy
-- it: both columns become nullable with ON DELETE SET NULL. The leaving
-- party's own rows elsewhere still cascade (that classification was audited
-- for this migration — every FK that references profiles or auth.users is
-- either "delete with the user" (their own requests, notifications,
-- portfolio, pins, blocks, reports, plan usage, subscriptions, push devices,
-- support tickets, campaign applications, and the updates/cards/files/change
-- requests/proposals they authored inside a project) or already ON DELETE
-- SET NULL (payments.payer_id, cancel_requested_by, manually_deleted_by,
-- admin audit actor, broadcasts created_by, the CRM SET NULL columns).
-- Three were wrong: the two participant columns, and project_documents.
-- issued_by, which was NO ACTION — deleting an account that had ever issued
-- an invoice FAILED, and only application code (hardDeleteAccount, the admin
-- delete route) nulled it first. The database now does that itself.
--
-- DELIBERATELY NOT CHANGED (product decisions, listed in the audit report):
--   reviews.from_user_id / to_user_id   a review disappears with either party
--   user_reports.reported_id            reports about a user vanish with them
--   project_stage_entries.author_user_id, project_cards.created_by,
--   project_assets.uploaded_by, project_change_requests.proposed_by
--                                       the leaver's own posted content is
--                                       removed with them (erasure), while the
--                                       money record and invoices are kept.
--
-- WHAT NULLED PARTICIPANT IDS MEAN FOR EXISTING LOGIC (checked, not assumed)
--
-- * RLS SELECT/UPDATE policies (006/036/072): `auth.uid() = owner_user_id OR
--   auth.uid() = counterparty_user_id`. With one side NULL the comparison is
--   NULL → the OR still passes for the surviving participant, and still fails
--   for everyone else. No change needed. (SQL: NULL = x is NULL, not false;
--   OR over a NULL row-level predicate is fine because the surviving side's
--   literal TRUE carries the row.)
-- * The no-self CHECK (owner_user_id <> counterparty_user_id): NULL-safe —
--   UNKNOWN is not FALSE, so a project with one participant nulled passes.
-- * enforce_project_consent() (081/133): the participant check is
--   `v_actor <> OLD.owner AND v_actor <> OLD.counterparty` → for the
--   surviving party one term is TRUE so the guard passes; a NULL side never
--   equals anyone. Auth-less service writes (the cascade itself) return early
--   on v_actor IS NULL. The trigger fires on UPDATE and never on the DELETE
--   cascade, so no re-derivation was needed.
-- * record_stage_signoff()/revoke_stage_signoff() (114): same participant
--   check, same NULL-safety. A sign-off on a project whose other party left
--   can no longer be mutual anyway — the API only advances such a frozen
--   record forward for reference.
-- * project_payments RLS (059) and project_documents RLS (124) check
--   participation through EXISTS (... campaign_projects p WHERE p.id =
--   project_id AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id =
--   auth.uid())) — NULL-safe for exactly the same reason. The surviving party
--   keeps reading the ledger and downloading the invoice; the leaving party's
--   auth user is gone so nobody else gains access.
-- * get_collaboration_stats (113/130), get_user_activity (073),
--   nudge_candidates (142), creator_collaborations (067): all join on
--   `owner_user_id = p_user_id OR counterparty_user_id = p_user_id`; NULL
--   sides simply don't match, which is correct.
-- * accept_collab_and_create_project (043) INSERTs with both ids NOT NULL —
--   creation is unchanged; the columns only ever become NULL through this
--   migration's SET NULL.
--
-- APP CODE
--
-- The web and mobile clients already treat an embedded participant profile as
-- optional (`owner`/`counterparty` may be null in the PostgREST response and
-- fall back to 'Partner' in most places). The routes and screens are updated
-- in the companion commit to render "Deleted account" instead of ever assuming
-- the id is present, and a new E2E phase proves the end-to-end behaviour:
-- a completed, paid project with an invoice survives one party's deletion and
-- the other party can still open project, payments and invoice.

ALTER TABLE public.campaign_projects
  ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.campaign_projects
  ALTER COLUMN counterparty_user_id DROP NOT NULL;

ALTER TABLE public.campaign_projects
  DROP CONSTRAINT IF EXISTS campaign_projects_owner_user_id_fkey;
ALTER TABLE public.campaign_projects
  ADD CONSTRAINT campaign_projects_owner_user_id_fkey
  FOREIGN KEY (owner_user_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

ALTER TABLE public.campaign_projects
  DROP CONSTRAINT IF EXISTS campaign_projects_counterparty_user_id_fkey;
ALTER TABLE public.campaign_projects
  ADD CONSTRAINT campaign_projects_counterparty_user_id_fkey
  FOREIGN KEY (counterparty_user_id)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

ALTER TABLE public.project_documents
  DROP CONSTRAINT IF EXISTS project_documents_issued_by_fkey;
ALTER TABLE public.project_documents
  ADD CONSTRAINT project_documents_issued_by_fkey
  FOREIGN KEY (issued_by)
  REFERENCES public.profiles (id)
  ON DELETE SET NULL;

-- Nothing else in the migration changes, but say WHY the check stays:
COMMENT ON CONSTRAINT campaign_projects_no_self ON public.campaign_projects IS
  'NULL-safe: with one participant deleted (ON DELETE SET NULL, migration 161) the comparison is UNKNOWN, which passes — a surviving record is not a violation.';

-- Keep the participant indexes; they still serve queries from the surviving
-- side and the SET NULL updates. No rebuild needed — FK changes alone don't
-- invalidate them.

-- A real health probe. The admin health page can only tell "applied" from "not
-- applied" by finding an object the migration creates, and this migration
-- creates none otherwise. The function also reports the actual state, so it
-- goes false again if a later migration ever re-adds a cascade.
CREATE OR REPLACE FUNCTION public.project_deletion_survival_ok()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT count(*) = 3
  FROM pg_constraint
  WHERE conname IN (
          'campaign_projects_owner_user_id_fkey',
          'campaign_projects_counterparty_user_id_fkey',
          'project_documents_issued_by_fkey'
        )
    AND confdeltype = 'n'; -- 'n' = ON DELETE SET NULL
$fn$;

COMMENT ON FUNCTION public.project_deletion_survival_ok() IS
  'True when a project, its payments and its invoices survive either participant deleting their account (migration 161).';
