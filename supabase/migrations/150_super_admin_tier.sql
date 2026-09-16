-- Migration 150: Super Admin / Developer Admin tier
-- Distinguishes Developer / Super Admins from Business / Client Admins.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_super_admin_idx
  ON public.profiles (role, is_super_admin)
  WHERE role = 'admin';

-- Drop previous 3-arg function before redefining
DROP FUNCTION IF EXISTS public.provision_admin(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.provision_admin(
  p_user_id        UUID,
  p_email          TEXT,
  p_name           TEXT DEFAULT NULL,
  p_is_super_admin BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.user_role;
BEGIN
  IF NOT public.is_privileged_connection() THEN
    RAISE EXCEPTION 'provision_admin requires a privileged connection'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'auth user % does not exist', p_user_id;
  END IF;

  SELECT role INTO v_existing FROM public.profiles WHERE id = p_user_id;

  INSERT INTO public.profiles (id, role, email, name, verification_status, is_super_admin)
  VALUES (p_user_id, 'admin', p_email, coalesce(p_name, 'Platform Admin'), 'verified', coalesce(p_is_super_admin, false))
  ON CONFLICT (id) DO UPDATE
    SET role = 'admin',
        name = coalesce(EXCLUDED.name, public.profiles.name),
        verification_status = 'verified',
        is_super_admin = coalesce(EXCLUDED.is_super_admin, public.profiles.is_super_admin, false),
        updated_at = now();

  INSERT INTO public.admin_audit_log (actor_id, actor_email, action, target_id, target_type, metadata)
  VALUES (p_user_id, p_email, 'admin_provisioned', p_user_id, 'profile',
          jsonb_build_object('previous_role', v_existing, 'is_super_admin', coalesce(p_is_super_admin, false)));

  RETURN jsonb_build_object('user_id', p_user_id, 'email', p_email, 'role', 'admin',
                            'previous_role', v_existing, 'is_super_admin', coalesce(p_is_super_admin, false));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_admin(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.provision_admin(
  p_user_id UUID,
  p_email   TEXT,
  p_name    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.provision_admin(p_user_id, p_email, p_name, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_admin(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
