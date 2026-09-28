\set ON_ERROR_STOP on
\pset pager off

-- Admin team hierarchy (migration 176): super admin → admin → staff.
--
-- The rules under test are the ones the API also checks, enforced again here
-- because the API check is only as good as the route that remembers to make it:
--   * an admin creates staff, never another admin; staff create nobody
--   * a grant never exceeds the creator's own access, section by section
--   * a creator never reveals a field group hidden from them
--   * narrowing an admin narrows the staff they created
--   * a disabled member fails is_admin(), so the direct-PostgREST path closes too
--   * a user session can reach none of it
--
-- Run after the harness + all migrations (see README).

CREATE OR REPLACE FUNCTION t_check(label text, cond boolean) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

-- Refused, and refused for the stated reason — a check that passes on any
-- error would pass on a typo.
CREATE OR REPLACE FUNCTION t_refused(label text, stmt text, why text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE why THEN
      RAISE EXCEPTION 'FAIL  % — refused, but with "%" (wanted "%")', label, SQLERRM, why;
    END IF;
    RAISE NOTICE 'PASS  % (refused: %)', label, left(SQLERRM, 70); RETURN;
  END;
  RAISE EXCEPTION 'FAIL  % — the statement was ALLOWED', label;
END $$;

-- ── Fixtures ──────────────────────────────────────────────────────────────
-- 01 super admin · 02 script-provisioned admin · 03 creator
-- 10 admin A1 · 11 staff S1 · 12 staff S2 · 13 admin A2
INSERT INTO auth.users (id, email) VALUES
  ('a7000000-0000-0000-0000-000000000001','team.super@test.com'),
  ('a7000000-0000-0000-0000-000000000002','team.legacy@test.com'),
  ('a7000000-0000-0000-0000-000000000003','team.creator@test.com'),
  ('a7000000-0000-0000-0000-000000000010','team.a1@test.com'),
  ('a7000000-0000-0000-0000-000000000011','team.s1@test.com'),
  ('a7000000-0000-0000-0000-000000000012','team.s2@test.com'),
  ('a7000000-0000-0000-0000-000000000013','team.a2@test.com')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, role, email, name) VALUES
  ('a7000000-0000-0000-0000-000000000003','influencer','team.creator@test.com','Creator')
ON CONFLICT DO NOTHING;
SELECT public.provision_admin('a7000000-0000-0000-0000-000000000001','team.super@test.com','Super',true);
SELECT public.provision_admin('a7000000-0000-0000-0000-000000000002','team.legacy@test.com','Legacy');

\set SUPER '''a7000000-0000-0000-0000-000000000001'''
\set LEGACY '''a7000000-0000-0000-0000-000000000002'''
\set CREATOR '''a7000000-0000-0000-0000-000000000003'''
\set A1 '''a7000000-0000-0000-0000-000000000010'''
\set S1 '''a7000000-0000-0000-0000-000000000011'''
\set S2 '''a7000000-0000-0000-0000-000000000012'''
\set A2 '''a7000000-0000-0000-0000-000000000013'''

-- ── Tiers ─────────────────────────────────────────────────────────────────
SELECT t_check('a script-provisioned admin holds every section at manage',
  (SELECT tier='admin' AND permissions->>'payments'='manage' AND permissions ? 'team'
     FROM public.admin_members WHERE user_id=:LEGACY));
SELECT t_check('a super admin has no member row — it holds everything',
  NOT EXISTS (SELECT 1 FROM public.admin_members WHERE user_id=:SUPER));
SELECT t_check('tier ranks: super 3, admin 2, creator 0',
  public.admin_tier_rank(:SUPER)=3 AND public.admin_tier_rank(:LEGACY)=2
  AND coalesce(public.admin_tier_rank(:CREATOR),0)=0);

-- ── Super admin creates an admin ──────────────────────────────────────────
SELECT public.admin_team_save(:SUPER, :A1, 'team.a1@test.com', 'A1', 'admin',
  '{"users":"manage","payments":"view","team":"manage","leads":"manage"}', '{email}');
SELECT t_check('the new admin has an admin profile and a creator on record',
  (SELECT p.role='admin' AND m.created_by=:SUPER
     FROM public.profiles p JOIN public.admin_members m ON m.user_id=p.id WHERE p.id=:A1));

-- ── What an admin may not do ──────────────────────────────────────────────
SELECT t_refused('an admin cannot create another admin',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000010','a7000000-0000-0000-0000-000000000013','team.a2@test.com','A2','admin','{}','{email}')$$,
  'Admins can create staff, not other admins.');
SELECT t_refused('an admin cannot grant manage where it holds view',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000010','a7000000-0000-0000-0000-000000000011','team.s1@test.com','S1','staff','{"payments":"manage"}','{email}')$$,
  'You cannot grant manage access to "payments"%');
SELECT t_refused('an admin cannot grant a section it does not hold',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000010','a7000000-0000-0000-0000-000000000011','team.s1@test.com','S1','staff','{"support":"view"}','{email}')$$,
  'You cannot grant view access to "support"%');
SELECT t_refused('an admin cannot reveal a field hidden from it',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000010','a7000000-0000-0000-0000-000000000011','team.s1@test.com','S1','staff','{"users":"view"}','{}')$$,
  'You cannot show fields that are hidden from you.');
SELECT t_refused('staff can never hold team access',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000011','team.s1@test.com','S1','staff','{"team":"view"}','{}')$$,
  'Staff accounts cannot manage the team.');
SELECT t_refused('a developer section cannot be delegated',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000011','team.s1@test.com','S1','staff','{"health":"view"}','{}')$$,
  'One of the sections or access levels is not recognised.');
SELECT t_refused('an existing creator account cannot be turned into staff',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000003','team.creator@test.com','C','staff','{}','{}')$$,
  'This email already belongs to an Influnet account.');

-- ── Admin creates staff within its grant ──────────────────────────────────
SELECT public.admin_team_save(:A1, :S1, 'team.s1@test.com', 'S1', 'staff',
  '{"users":"manage","payments":"view","leads":"view"}', '{email,phone}');
SELECT t_check('an admin creates staff inside its own access', public.admin_tier_rank(:S1)=1);
SELECT t_refused('staff create nobody',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000012','team.s2@test.com','S2','staff','{}','{email,phone}')$$,
  'Your account cannot create or change team members.');

-- ── Who manages whom ──────────────────────────────────────────────────────
SELECT t_check('an admin manages the staff it created', public.admin_can_manage(:A1, :S1));
SELECT t_check('an admin cannot manage another admin', NOT public.admin_can_manage(:A1, :LEGACY));
SELECT t_check('an admin cannot manage another admin''s staff', NOT public.admin_can_manage(:LEGACY, :S1));
SELECT t_check('nobody manages themselves', NOT public.admin_can_manage(:A1, :A1) AND NOT public.admin_can_manage(:SUPER, :SUPER));
SELECT t_check('a super admin manages every member', public.admin_can_manage(:SUPER, :S1) AND public.admin_can_manage(:SUPER, :A1));

-- ── Narrowing an admin narrows its staff ──────────────────────────────────
SELECT public.admin_team_save(:SUPER, :A1, NULL, NULL, 'admin',
  '{"users":"view","payments":"view","team":"manage"}', '{email,location}');
SELECT t_check('staff are clamped to their admin (users manage→view, leads dropped)',
  (SELECT permissions = '{"users":"view","payments":"view"}'::jsonb FROM public.admin_members WHERE user_id=:S1));
SELECT t_check('staff inherit a field newly hidden from their admin',
  (SELECT hidden_fields = '{email,location,phone}' FROM public.admin_members WHERE user_id=:S1));
SELECT t_refused('an admin with staff cannot be demoted to staff',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000001','a7000000-0000-0000-0000-000000000010',NULL,NULL,'staff','{}','{email,location}')$$,
  'This admin has staff.%');

-- ── Disabling ─────────────────────────────────────────────────────────────
SET request.test.uid = 'a7000000-0000-0000-0000-000000000011';
SELECT t_check('an enabled staff member is an admin to RLS', public.is_admin());
SELECT public.admin_team_set_disabled(:A1, :S1, true);
SELECT t_check('a disabled staff member is NOT an admin to RLS', NOT public.is_admin());
SELECT public.admin_team_set_disabled(:A1, :S1, false);
SELECT t_check('re-enabling restores it', public.is_admin());
SELECT t_refused('staff cannot disable their admin',
  $$SELECT public.admin_team_set_disabled('a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000010',true)$$,
  'You cannot change this team member.');
SELECT public.admin_team_set_disabled(:SUPER, :A1, true);
SELECT t_check('a disabled admin loses its team powers', NOT public.admin_can_manage(:A1, :S1));
SELECT public.admin_team_set_disabled(:SUPER, :A1, false);
SET request.test.uid = 'a7000000-0000-0000-0000-000000000001';
SELECT t_check('a super admin is unaffected', public.is_admin());
RESET request.test.uid;

-- ── The script path ───────────────────────────────────────────────────────
SELECT public.provision_admin(:A2, 'team.a2@test.com', 'A2');
SELECT t_check('provision_admin gives a plain admin a full member row',
  (SELECT permissions ? 'payments' FROM public.admin_members WHERE user_id=:A2));
SELECT public.provision_admin(:A2, 'team.a2@test.com', 'A2', true);
SELECT t_check('promoting to super admin drops the member row',
  NOT EXISTS (SELECT 1 FROM public.admin_members WHERE user_id=:A2));

-- ── Unreachable from a user session ───────────────────────────────────────
SET ROLE authenticated;
SET request.test.uid = 'a7000000-0000-0000-0000-000000000011';
SELECT t_refused('admin_team_save is not callable from a user session',
  $$SELECT public.admin_team_save('a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000012','x@test.com','X','staff','{}','{}')$$,
  'permission denied%');
SELECT t_refused('admin_team_set_disabled is not callable from a user session',
  $$SELECT public.admin_team_set_disabled('a7000000-0000-0000-0000-000000000011','a7000000-0000-0000-0000-000000000010',true)$$,
  'permission denied%');
SELECT t_refused('admin_members is not readable from a user session',
  $$SELECT count(*) FROM public.admin_members$$,
  'permission denied%');
RESET ROLE;
RESET request.test.uid;

SELECT t_check('every team change is in the audit log',
  (SELECT count(*) FROM public.admin_audit_log WHERE action LIKE 'admin_member_%') >= 6);
