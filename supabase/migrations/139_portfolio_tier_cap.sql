-- Migration 139: make the portfolio cap tier-aware
--
-- Migration 087 capped every creator's manual portfolio at a flat 24 with a
-- BEFORE INSERT trigger — a PERFORMANCE ceiling (the public page renders every
-- row), never a billing one. The founder wants Free capped at 5, with Pro
-- keeping the 24 wall.
--
-- Both limits live in billing_settings (migration 138: free_portfolio_items = 5,
-- pro_portfolio_items = 24). The trigger now enforces:
--
--   • ALWAYS: the absolute wall (pro_portfolio_items). Unconditional, so a
--     deployment with billing switched off never regresses to an unbounded
--     portfolio — this is the 087 behaviour, preserved.
--   • WHEN db_enforcement_enabled AND the owner is Free: the lower Free ceiling,
--     with an upgrade-shaped message the API maps to a 402.
--
-- Same advisory-lock-per-owner pattern as enforce_project_quota /
-- enforce_campaign_quota, for the same reason: two inserts for one creator
-- landing together must not both pass the count check.

CREATE OR REPLACE FUNCTION public.enforce_portfolio_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled    BOOLEAN;
  v_free_limit INTEGER;
  v_wall       INTEGER;
  v_count      INTEGER;
BEGIN
  SELECT db_enforcement_enabled, free_portfolio_items, pro_portfolio_items
    INTO v_enabled, v_free_limit, v_wall
  FROM public.billing_settings WHERE id;

  -- Defaults if billing_settings is somehow unreadable — keep the 087 wall.
  v_wall := COALESCE(v_wall, 24);

  PERFORM pg_advisory_xact_lock(hashtext('portfolio_quota:' || NEW.user_id::TEXT));

  SELECT count(*) INTO v_count
  FROM public.creator_portfolio_items
  WHERE user_id = NEW.user_id;

  -- The absolute wall, always.
  IF v_count >= v_wall THEN
    RAISE EXCEPTION 'Portfolio is full (% items). Remove one before adding another.', v_wall
      USING ERRCODE = 'check_violation';
  END IF;

  -- The billing ceiling, only when enforcement is on and the owner is Free.
  IF COALESCE(v_enabled, FALSE)
     AND v_free_limit IS NOT NULL
     AND public.current_tier(NEW.user_id) = 'free'
     AND v_count >= v_free_limit
  THEN
    -- Machine-readable tail so the route can tell this apart from the wall and
    -- render an upgrade prompt rather than "remove one".
    RAISE EXCEPTION 'portfolio_quota_exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition unchanged (BEFORE INSERT on creator_portfolio_items) —
-- re-declared for clarity that nothing at the trigger level changed.
DROP TRIGGER IF EXISTS trg_portfolio_limit ON public.creator_portfolio_items;
CREATE TRIGGER trg_portfolio_limit
  BEFORE INSERT ON public.creator_portfolio_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portfolio_limit();
