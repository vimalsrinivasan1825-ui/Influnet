-- Migration 059: Project payments ledger (Razorpay)
--
-- Records money movement for a project's payment gates (advance_payment /
-- final_payment). The app is launch-safe WITHOUT this table applied: the
-- payments API degrades to "manual (off-platform)" mode and the UI reflects it.
-- When Razorpay is configured, the create-order route writes a 'created' row and
-- the signature-verified webhook flips it to 'paid' and completes the gate item.
--
-- Amounts are stored in the smallest currency unit (paise for INR), matching
-- Razorpay's API — never store rupees here.

CREATE TABLE IF NOT EXISTS public.project_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          bigint NOT NULL REFERENCES public.campaign_projects (id) ON DELETE CASCADE,
  stage_key           text NOT NULL,                 -- 'advance_payment' | 'final_payment'
  amount              integer NOT NULL CHECK (amount > 0),  -- paise
  currency            text NOT NULL DEFAULT 'INR',
  status              text NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  payer_id            uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  razorpay_order_id   text UNIQUE,                    -- set on order creation
  razorpay_payment_id text,                           -- set on capture (webhook)
  notes               jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  paid_at             timestamptz
);

CREATE INDEX IF NOT EXISTS project_payments_project_idx
  ON public.project_payments (project_id, stage_key);
CREATE INDEX IF NOT EXISTS project_payments_order_idx
  ON public.project_payments (razorpay_order_id);

ALTER TABLE public.project_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: either participant can see the project's payment records.
DROP POLICY IF EXISTS project_payments_select ON public.project_payments;
CREATE POLICY project_payments_select ON public.project_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- INSERT: a participant (the payer) can create an order record for their project.
DROP POLICY IF EXISTS project_payments_insert ON public.project_payments;
CREATE POLICY project_payments_insert ON public.project_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );

-- NOTE: no UPDATE policy for authenticated users on purpose. Status transitions
-- to 'paid'/'failed'/'refunded' are made ONLY by the server via the service-role
-- key in the signature-verified Razorpay webhook — a client can never mark a
-- payment paid.
