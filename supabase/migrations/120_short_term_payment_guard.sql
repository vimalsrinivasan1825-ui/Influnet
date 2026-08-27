-- Migration 120: Short-term payment guard
--
-- A barter project has budget = 0, so there is no Razorpay order and no
-- webhook to open the gate. The gate therefore opens on mutual sign-off
-- instead, and that is only acceptable because:
--
-- 1. is_barter is fixed at proposal time and agreed by both parties;
-- 2. is_barter is immutable after insert (enforce in the 119 trigger);
-- 3. the barter path is selected by the stored is_barter flag, never by
--    "the amount happens to be zero" at request time.
--
-- This trigger refuses to move a NON-BARTER short project into
-- 'project_completed' while its payment ledger holds no confirmed row.
-- Defence in depth, in the same spirit as the consent triggers in 081/082.

CREATE OR REPLACE FUNCTION public.enforce_short_payment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_flow TEXT;
  v_barter BOOLEAN;
  v_has_paid BOOLEAN;
BEGIN
  -- Only fires on stage transition to project_completed
  IF NEW.current_stage <> 'project_completed' OR OLD.current_stage = 'project_completed' THEN
    RETURN NEW;
  END IF;

  -- Only applies to short flows
  v_flow := NEW.flow_key;
  IF v_flow IS NULL OR v_flow = 'full' THEN
    RETURN NEW;
  END IF;

  -- Barter projects bypass the payment check
  v_barter := NEW.is_barter;
  IF v_barter THEN
    RETURN NEW;
  END IF;

  -- Non-barter short project: must have at least one confirmed payment
  SELECT EXISTS (
    SELECT 1 FROM public.project_payments
    WHERE project_id = NEW.id AND status = 'paid'
  ) INTO v_has_paid;

  IF NOT v_has_paid THEN
    RAISE EXCEPTION 'short_project_payment_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_short_payment_guard ON public.campaign_projects;
CREATE CONSTRAINT TRIGGER trg_short_payment_guard
  AFTER UPDATE OF current_stage ON public.campaign_projects
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_short_payment_guard();
