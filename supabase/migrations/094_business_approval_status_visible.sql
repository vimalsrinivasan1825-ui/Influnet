-- Migration 094: make business_profiles.approval_status readable.
--
-- Sending a collab request is no longer blocked on admin approval (product
-- decision 2026-07-30) — a pending/rejected business can now reach out to a
-- creator directly. In exchange, the creator needs to be able to see that the
-- business isn't Influnet-verified yet, so GET /api/collabs can show a
-- precaution flag on the incoming request. approval_status was never
-- sensitive PII (migration 053 only locked down gst_number,
-- registered_address, marketing_budget) — it just wasn't previously granted
-- because nothing outside the owner needed to read it.

GRANT SELECT (user_id, company_name, industry, approval_status)
  ON public.business_profiles TO authenticated;
