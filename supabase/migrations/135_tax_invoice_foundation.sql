-- Migration 135: Tax invoice foundation (B4)
--
-- SUPPLIER MODEL: the creator is the supplier, the brand is the recipient.
-- Nothing in this codebase's payment flow deducts a platform fee — the
-- Razorpay order amount is always the full agreed budget (see
-- apps/web/src/app/api/projects/[id]/payments/route.ts) — so Influnet is
-- never a financial party to the transaction. It is the venue the deal
-- happens on, not the seller. This is the answer to the open question in
-- the Release 1 scope document ("is Influnet selling a service to the
-- brand, or is the creator selling to the brand with Influnet as the
-- venue?"), derived from how money actually moves rather than assumed.
--
-- MOST CREATORS ARE NOT GST-REGISTERED. profiles had no GST field at all
-- before this migration, unlike business_profiles (which already has
-- gst_number, registered_address, state — the brand side was covered).
-- Adding one nullable column, rather than requiring it, matters: under
-- Indian GST law an unregistered supplier may not charge GST, so "no GSTIN
-- on file" is not a missing feature to work around — it is the common,
-- legally correct case, handled by issuing a Bill of Supply instead of a
-- Tax Invoice with a tax breakup. See receipt-template.tsx.
--
-- GAPLESS NUMBERING: a Postgres SEQUENCE skips numbers on a rolled-back
-- transaction, which is exactly the failure mode a tax numbering series
-- cannot have. allocate_invoice_number() is a single atomic UPSERT instead —
-- correct under concurrency (the UPDATE takes a row lock), and gapless under
-- normal operation. Note this is not a substitute for correct application
-- logic: a caller that allocates a number and then fails to write the
-- document row still leaves a gap, the same as any real invoicing system
-- that numbers before it commits.

-- 1. Creator-side GST number, optional.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gst_number TEXT;

COMMENT ON COLUMN public.profiles.gst_number IS
  'Optional. Most individual creators are not GST-registered — absence means a Bill of Supply is the correct document, not an error.';

-- 2. The GST rate applied when a supplier IS registered. One flat rate,
-- configurable, rather than hard-coded — services in India are commonly 18%,
-- but this is a number, and numbers live in billing_settings, not in code.
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS gst_rate_percent NUMERIC NOT NULL DEFAULT 18;

-- 3. The numbering series itself.
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  series      TEXT PRIMARY KEY,   -- e.g. 'tax_invoice_2026', 'bill_of_supply_2026'
  next_number INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
-- No policies at all — service role only, same posture as billing_events.
REVOKE ALL ON public.invoice_number_counters FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_series TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_number INTEGER;
BEGIN
  INSERT INTO public.invoice_number_counters (series, next_number)
  VALUES (p_series, 2)
  ON CONFLICT (series) DO UPDATE
    SET next_number = public.invoice_number_counters.next_number + 1
  RETURNING next_number - 1 INTO v_number;

  RETURN v_number;
END;
$$;

-- Not granted to authenticated — only the service-role document route calls
-- this, same as the write to project_documents itself.
REVOKE ALL ON FUNCTION public.allocate_invoice_number(TEXT) FROM PUBLIC, authenticated, anon;
