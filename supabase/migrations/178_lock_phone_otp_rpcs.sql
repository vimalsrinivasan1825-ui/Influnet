-- The phone_otp_* functions are SECURITY DEFINER and were never REVOKEd, so the
-- default EXECUTE-to-PUBLIC applied: an anonymous caller could create a session
-- and mark it verified with no SMS, minting a valid verificationToken for any
-- phone number. Only the phone-otp edge function (service role) may call them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'phone\_otp\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
