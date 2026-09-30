-- submit_verification and confirm_social_claim were executable by every
-- authenticated user and trusted their arguments (p_status = 'verified',
-- p_matched = true), so anyone could self-award the verified badge or "prove"
-- ownership of an Instagram handle they do not own. The server decides these
-- outcomes (score + live scrape), so the RPCs now take the user id explicitly
-- and are callable by the service role only.
DROP FUNCTION IF EXISTS public.submit_verification(jsonb, numeric, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.confirm_social_claim(text, text, boolean, jsonb);

CREATE OR REPLACE FUNCTION public.submit_verification(
  p_user_id     uuid,
  p_signals     jsonb,
  p_score       numeric,
  p_reason      text,
  p_status      text,
  p_notif_type  text,
  p_notif_title text,
  p_notif_body  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urole text;
  check_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_status NOT IN ('pending', 'in_review', 'needs_more_info', 'verified') THEN
    RAISE EXCEPTION 'Invalid self-service status: %', p_status;
  END IF;

  SELECT role INTO urole FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.verification_checks (user_id, role, status, ai_score, ai_reason, ai_signals, decided_by, decided_at)
  VALUES (p_user_id, urole, p_status, p_score, p_reason, COALESCE(p_signals, '{}'::jsonb), 'ai', now())
  RETURNING id INTO check_id;

  UPDATE public.profiles SET verification_status = p_status, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_notif_type, p_notif_title, p_notif_body, '/dashboard/settings');

  RETURN jsonb_build_object('check_id', check_id, 'status', p_status, 'score', p_score);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_social_claim(
  p_user_id  uuid,
  p_platform text,
  p_handle   text,
  p_matched  boolean,
  p_proof    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_status text;
  new_attempts integer;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.social_account_claims
    SET attempts = attempts + 1,
        last_attempt_at = now(),
        status = CASE WHEN p_matched THEN 'verified' ELSE status END,
        verified_at = CASE WHEN p_matched THEN now() ELSE verified_at END,
        proof = CASE WHEN p_matched THEN p_proof ELSE proof END,
        updated_at = now()
  WHERE user_id = p_user_id AND platform = p_platform AND handle = p_handle
    AND status = 'pending' AND expires_at > now()
  RETURNING status, attempts INTO new_status, new_attempts;

  IF new_status IS NULL THEN
    RAISE EXCEPTION 'No pending, unexpired verification to confirm — start again'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('status', new_status, 'attempts', new_attempts, 'matched', p_matched);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This % account was just verified by another Influnet account', p_platform
      USING ERRCODE = 'raise_exception';
END;
$$;

REVOKE ALL ON FUNCTION public.submit_verification(uuid, jsonb, numeric, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_social_claim(uuid, text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verification(uuid, jsonb, numeric, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_social_claim(uuid, text, text, boolean, jsonb) TO service_role;
