-- Migration 141: business contact details + the reveal gate
--
-- The founder: a creator can see a business owner's contact info for 5
-- businesses free; the 6th needs Pro.
--
-- business_profiles had no contact fields at all — only `website`. This adds
-- three nullable columns (a business fills them in on their edit screen) and
-- an atomic reveal function. business_contact_reveals (the lifetime ledger)
-- was created in migration 138.
--
-- The count-check-insert is done inside a SECURITY DEFINER function behind an
-- advisory lock, the same reason enforce_project_quota does: the ledger is
-- written by the route with the service role (no INSERT policy for
-- authenticated), and "SELECT count(*) then INSERT" from the route would let
-- two reveals for one creator both pass on the last free slot.

-- ── 1. Contact columns ────────────────────────────────────────────────────
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

COMMENT ON COLUMN public.business_profiles.contact_phone IS
  'Direct line shown to a creator only after they spend a contact reveal (or on Pro). Not in any public RPC.';

-- No SELECT grant to `authenticated` for these three columns — they must never
-- become broadly readable. The reveal function below reads them with the
-- definer''s rights and returns them only when the reveal is allowed; the
-- business''s own edit screen reads them through get_own_business_profile().
REVOKE SELECT (contact_name, contact_phone, contact_email)
  ON public.business_profiles FROM authenticated, anon;

-- ── 2. reveal_business_contact() — atomic, returns the contact when allowed ─
CREATE OR REPLACE FUNCTION public.reveal_business_contact(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator  UUID := auth.uid();
  v_enabled  BOOLEAN;
  v_limit    INTEGER;
  v_count    INTEGER;
  v_already  BOOLEAN;
  v_tier     public.plan_tier;
  v_name     TEXT;
  v_phone    TEXT;
  v_email    TEXT;
  v_website  TEXT;
  v_company  TEXT;
BEGIN
  IF v_creator IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_business_id = v_creator THEN RAISE EXCEPTION 'cannot_reveal_self'; END IF;

  SELECT db_enforcement_enabled, free_contact_reveals
    INTO v_enabled, v_limit
  FROM public.billing_settings WHERE id;

  v_tier := public.current_tier(v_creator);

  PERFORM pg_advisory_xact_lock(hashtext('contact_reveal:' || v_creator::TEXT));

  SELECT TRUE INTO v_already
  FROM public.business_contact_reveals
  WHERE creator_id = v_creator AND business_id = p_business_id;

  -- Not yet revealed, and enforcement says a Free creator is out of reveals.
  IF v_already IS NULL
     AND COALESCE(v_enabled, FALSE)
     AND v_limit IS NOT NULL
     AND v_tier = 'free'
  THEN
    SELECT count(*) INTO v_count
    FROM public.business_contact_reveals
    WHERE creator_id = v_creator;

    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('allowed', FALSE, 'used', v_count, 'limit', v_limit);
    END IF;
  END IF;

  IF v_already IS NULL THEN
    INSERT INTO public.business_contact_reveals (creator_id, business_id)
    VALUES (v_creator, p_business_id)
    ON CONFLICT (creator_id, business_id) DO NOTHING;
  END IF;

  SELECT bp.contact_name, bp.contact_phone, bp.contact_email, bp.website, bp.company_name
    INTO v_name, v_phone, v_email, v_website, v_company
  FROM public.business_profiles bp
  WHERE bp.user_id = p_business_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'contact', jsonb_build_object(
      'companyName', v_company,
      'name',        v_name,
      'phone',       v_phone,
      'email',       v_email,
      'website',     v_website
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reveal_business_contact(UUID) TO authenticated;
