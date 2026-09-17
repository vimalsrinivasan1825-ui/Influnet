-- Migration 151: harden the super-admin tier (150) and the profile privilege guard (070)
--
-- 1. provision_admin() had two overloads after 150: (uuid,text,text) and
--    (uuid,text,text,boolean DEFAULT false). Any 3-argument call is then
--    ambiguous — Postgres answers 42725 "function ... is not unique" — so the
--    "backwards compatible" overload made the old call shape fail outright.
--    One function remains, with the tier argument defaulting to NULL.
--
-- 2. 150's upsert wrote `coalesce(EXCLUDED.is_super_admin, ...)`, and EXCLUDED
--    was never NULL (the VALUES clause coalesced to false). Re-running
--    create-admin.mjs for an existing super admin without --super therefore
--    silently demoted them. NULL now means "keep the current tier"; only an
--    explicit true/false changes it.
--
-- 3. guard_profile_privileges() was SECURITY DEFINER. Inside a definer function
--    current_user is the function OWNER, so is_privileged_connection() —
--    `current_user NOT IN ('authenticated','anon')` — was always true and the
--    trigger returned NEW for everyone. Since 070 the role/verification guard
--    has been a no-op; column-level UPDATE grants were the only thing keeping a
--    user from promoting themselves. It now runs as the invoker, so a user
--    session is judged as a user session. SECURITY DEFINER RPCs that update
--    profiles still run as their owner and are still trusted, as intended.
--    It also covers is_super_admin.

-- ── 1 + 2 ────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.provision_admin(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.provision_admin(UUID, TEXT, TEXT, BOOLEAN);

CREATE FUNCTION public.provision_admin(
  p_user_id        UUID,
  p_email          TEXT,
  p_name           TEXT    DEFAULT NULL,
  p_is_super_admin BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing       public.user_role;
  v_existing_super BOOLEAN;
  v_super          BOOLEAN;
BEGIN
  IF NOT public.is_privileged_connection() THEN
    RAISE EXCEPTION 'provision_admin requires a privileged connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'auth user % does not exist', p_user_id;
  END IF;

  SELECT role, is_super_admin INTO v_existing, v_existing_super
    FROM public.profiles WHERE id = p_user_id;

  -- NULL = keep whatever tier the account already has (false for a new admin).
  v_super := coalesce(p_is_super_admin, v_existing_super, false);

  INSERT INTO public.profiles (id, role, email, name, verification_status, is_super_admin)
  VALUES (p_user_id, 'admin', p_email, coalesce(p_name, 'Platform Admin'), 'verified', v_super)
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        name = coalesce(p_name, public.profiles.name),
        verification_status = 'verified',
        is_super_admin = v_super,
        updated_at = now();

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
  VALUES (p_user_id, p_email, 'admin_provisioned', p_user_id, 'profile',
          jsonb_build_object('previous_role', v_existing,
                             'previous_is_super_admin', v_existing_super,
                             'is_super_admin', v_super));

  RETURN jsonb_build_object('user_id', p_user_id, 'email', p_email, 'role', 'admin',
                            'previous_role', v_existing, 'is_super_admin', v_super);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_admin(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── 3 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_privileged_connection() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN
    RAISE EXCEPTION 'role cannot be changed from a user session'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.verified_badge IS DISTINCT FROM OLD.verified_badge
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'verification state cannot be changed from a user session'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
