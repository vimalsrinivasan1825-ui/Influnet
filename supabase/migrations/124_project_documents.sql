-- Migration 124: Project documents (receipts, proformas, tax invoices)
--
-- Documents are immutable after issue: the snapshot jsonb holds everything
-- printed, frozen at issue time. Rendering reads the snapshot and nothing
-- else. Correction = cancelled_at on the old row plus a new row.

CREATE TABLE IF NOT EXISTS public.project_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    bigint NOT NULL REFERENCES public.campaign_projects(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('proforma', 'receipt', 'tax_invoice')),
  number        text NOT NULL,
  snapshot      jsonb NOT NULL,
  total_paise   bigint NOT NULL,
  currency      text NOT NULL DEFAULT 'INR',
  file_url      text,
  issued_by     uuid REFERENCES public.profiles(id),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  UNIQUE (kind, number)
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

-- SELECT: either participant can see the project's documents.
DROP POLICY IF EXISTS project_documents_select ON public.project_documents;
CREATE POLICY project_documents_select ON public.project_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- No INSERT/UPDATE/DELETE for authenticated — documents are written by the
-- route with the service role, so a participant cannot forge one by talking
-- to PostgREST with the anon key.
