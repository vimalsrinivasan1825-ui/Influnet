CREATE OR REPLACE FUNCTION public.check_email_available(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = lower(trim(p_email))
  );
END;
$$;
