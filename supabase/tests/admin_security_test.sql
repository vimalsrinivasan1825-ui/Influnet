\set ON_ERROR_STOP on
\pset pager off

-- Privilege-escalation and admin-hardening regression tests (migration 070).
--
-- Before 070, `profiles_update_own` let any authenticated user UPDATE their own
-- row with no column restriction, and Supabase's stock grants include UPDATE on
-- public tables. One PATCH to /rest/v1/profiles made anyone an admin. These
-- assertions must never go green-to-red again.
--
-- Run AFTER applying the harness + all migrations, and after replicating
-- Supabase's default grants (see README).

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_denied(label text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN insufficient_privilege OR others THEN
    RAISE NOTICE 'PASS  % (blocked: %)', label, left(SQLERRM, 60); RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % — the statement was ALLOWED', label;
END $$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaa1111-0000-0000-0000-00000000000a','sec.admin@test.com'),
  ('bbbb2222-0000-0000-0000-00000000000b','sec.mallory@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, email, name) VALUES
  ('bbbb2222-0000-0000-0000-00000000000b','influencer','sec.mallory@test.com','Mallory')
ON CONFLICT DO NOTHING;

-- ── Provisioning works from a privileged connection ───────────────────────
SELECT t_check('provision_admin mints an admin from a privileged connection',
  (public.provision_admin('aaaa1111-0000-0000-0000-00000000000a','sec.admin@test.com','Sec Admin')->>'role') = 'admin');
SELECT t_check('provisioning is recorded in the audit log',
  EXISTS (SELECT 1 FROM public.admin_audit_log
          WHERE action='admin_provisioned' AND target_id='aaaa1111-0000-0000-0000-00000000000a'));

-- ── The escalation vector is closed ───────────────────────────────────────
SET ROLE authenticated;
SET request.test.uid = 'bbbb2222-0000-0000-0000-00000000000b';

SELECT t_denied('a user cannot promote themselves to admin',
  $$UPDATE public.profiles SET role='admin' WHERE id='bbbb2222-0000-0000-0000-00000000000b'$$);
SELECT t_denied('a user cannot self-verify',
  $$UPDATE public.profiles SET verification_status='verified' WHERE id='bbbb2222-0000-0000-0000-00000000000b'$$);
SELECT t_denied('a user cannot grant themselves the verified badge',
  $$UPDATE public.profiles SET verified_badge=true WHERE id='bbbb2222-0000-0000-0000-00000000000b'$$);
SELECT t_denied('a user cannot promote someone else',
  $$UPDATE public.profiles SET role='admin' WHERE id='aaaa1111-0000-0000-0000-00000000000a'$$);
SELECT t_denied('provision_admin is not callable from a user session',
  $$SELECT public.provision_admin('bbbb2222-0000-0000-0000-00000000000b','sec.mallory@test.com','M')$$);
SELECT t_denied('revoke_admin is not callable from a user session',
  $$SELECT public.revoke_admin('aaaa1111-0000-0000-0000-00000000000a')$$);
SELECT t_denied('the audit log cannot be forged from a user session',
  $$INSERT INTO public.admin_audit_log (action) VALUES ('forged')$$);

-- ── Legitimate self-service still works ───────────────────────────────────
UPDATE public.profiles SET name='Mallory Renamed', location='Chennai'
WHERE id='bbbb2222-0000-0000-0000-00000000000b';
SELECT t_check('a user CAN still edit their own name and location',
  (SELECT name='Mallory Renamed' AND location='Chennai'
     FROM public.profiles WHERE id='bbbb2222-0000-0000-0000-00000000000b'));

RESET ROLE;
SELECT t_check('after every attack Mallory is still a plain influencer',
  (SELECT role::text FROM public.profiles WHERE id='bbbb2222-0000-0000-0000-00000000000b') = 'influencer');

-- ── Audit-log visibility ──────────────────────────────────────────────────
SET ROLE authenticated;
SET request.test.uid = 'bbbb2222-0000-0000-0000-00000000000b';
SELECT t_check('a non-admin sees nothing in the audit log',
  (SELECT count(*) FROM public.admin_audit_log) = 0);
SET request.test.uid = 'aaaa1111-0000-0000-0000-00000000000a';
SELECT t_check('an admin can read the audit log',
  (SELECT count(*) FROM public.admin_audit_log) > 0);
RESET ROLE;

-- ── Demotion path ─────────────────────────────────────────────────────────
SELECT t_check('revoke_admin demotes from a privileged connection',
  (public.revoke_admin('aaaa1111-0000-0000-0000-00000000000a','influencer')->>'role') = 'influencer');

SELECT '── ALL ADMIN-SECURITY ASSERTIONS PASSED ──' AS result;
