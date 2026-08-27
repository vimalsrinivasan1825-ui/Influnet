-- Migration 119: Project flow foundation
--
-- Adds the flow_key column to campaign_projects and project_proposals so the
-- existing 12-stage state machine can be extended with short-term flows
-- (3 stages) without building a parallel machine.
--
-- Every existing row gets flow_key = 'full' by default, which is what it
-- already is. The trigger enforces immutability after insert: the flow is
-- chosen once at proposal time and cannot be changed mid-flight (converting
-- would mean reconciling stage history against a payment already taken).
--
-- Also adds deliverables, start_date, is_barter, and barter_details to both
-- tables — the fields that differ between a full and short-term project.

-- 1. campaign_projects columns
ALTER TABLE public.campaign_projects
  ADD COLUMN IF NOT EXISTS flow_key      TEXT NOT NULL DEFAULT 'full'
    CHECK (flow_key IN ('full', 'short_pay_after', 'short_pay_before')),
  ADD COLUMN IF NOT EXISTS deliverables  TEXT,
  ADD COLUMN IF NOT EXISTS start_date    DATE,
  ADD COLUMN IF NOT EXISTS is_barter     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS barter_details TEXT;

-- 2. project_proposals columns (carried through from proposal to project)
ALTER TABLE public.project_proposals
  ADD COLUMN IF NOT EXISTS flow_key      TEXT NOT NULL DEFAULT 'full'
    CHECK (flow_key IN ('full', 'short_pay_after', 'short_pay_before')),
  ADD COLUMN IF NOT EXISTS deliverables  TEXT,
  ADD COLUMN IF NOT EXISTS start_date    DATE,
  ADD COLUMN IF NOT EXISTS is_barter     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS barter_details TEXT;

-- 3. Immutability triggers — flow_key and is_barter must not change after insert.
--    This is enforced at the database level, not in application code, because
--    converting a project's flow mid-flight would mean reconciling stage history
--    against a payment already taken.

CREATE OR REPLACE FUNCTION public.prevent_flow_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.flow_key IS DISTINCT FROM NEW.flow_key THEN
    RAISE EXCEPTION 'flow_key is immutable after creation';
  END IF;
  IF OLD.is_barter IS DISTINCT FROM NEW.is_barter THEN
    RAISE EXCEPTION 'is_barter is immutable after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_flow_immutable ON public.campaign_projects;
CREATE TRIGGER trg_prevent_flow_immutable
  BEFORE UPDATE ON public.campaign_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_flow_immutable_fields();

DROP TRIGGER IF EXISTS trg_prevent_flow_immutable_proposals ON public.project_proposals;
CREATE TRIGGER trg_prevent_flow_immutable_proposals
  BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_flow_immutable_fields();
