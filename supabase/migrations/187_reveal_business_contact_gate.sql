-- reveal_business_contact is executable by every signed-in user and only the API
-- route checked that the caller is a creator with a relationship to the
-- business, so a direct RPC call could read any business's private contact
-- details (bounded only by the free-tier quota). Enforce the gate in the function.
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

  -- Same gate the API route applies, enforced here so a direct RPC call cannot
  -- skip it: only creators, and only for businesses they have a request or
  -- project with.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_creator AND role = 'influencer') THEN
    RAISE EXCEPTION 'creators_only' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.collab_requests cr
      WHERE cr.status IN ('pending', 'accepted')
        AND ((cr.from_user_id = p_business_id AND cr.to_user_id = v_creator)
          OR (cr.from_user_id = v_creator AND cr.to_user_id = p_business_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.campaign_projects cp
      WHERE (cp.owner_user_id = p_business_id AND cp.counterparty_user_id = v_creator)
         OR (cp.owner_user_id = v_creator AND cp.counterparty_user_id = p_business_id)
    )
  ) THEN
    RAISE EXCEPTION 'no_relationship' USING ERRCODE = '42501';
  END IF;

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

