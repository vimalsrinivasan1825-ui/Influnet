-- The insert policy let the payer write any status, so a client could POST a
-- ledger row with status = 'paid' and pass the payment gate / obtain an invoice
-- without paying. Clients may only record a freshly created order; only the
-- signature-verified Razorpay webhook (service role) moves it to paid.
DROP POLICY IF EXISTS project_payments_insert ON public.project_payments;
CREATE POLICY project_payments_insert ON public.project_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND status = 'created'
    AND razorpay_payment_id IS NULL
    AND paid_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.campaign_projects p
      WHERE p.id = project_id
        AND (p.owner_user_id = auth.uid() OR p.counterparty_user_id = auth.uid())
    )
  );
