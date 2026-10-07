-- Migration 195: admin-facing sign-in history for one user.
--
-- G10 (docs/operations/ADMIN_AND_OBSERVABILITY_GAPS_2026-10-06.md): Supabase's
-- own auth.audit_log_entries already records every login/logout/token-refresh,
-- but nothing surfaced it — "did this account sign in from a new device
-- yesterday" could only be answered from the Supabase SQL editor.
--
-- auth.audit_log_entries is not exposed through PostgREST (only `public` is),
-- so this is a SECURITY DEFINER function in `public` that reads it directly —
-- same pattern as admin_get_user_activity (108) reading rows an admin could
-- already see one table at a time. payload is a loosely-typed json blob from
-- GoTrue; only the keys GoTrue has shipped for years (action, actor_id) are
-- read, and missing keys degrade to null rather than erroring.

CREATE OR REPLACE FUNCTION public.admin_get_user_signins(
  p_user_id UUID,
  p_limit   INT DEFAULT 50
)
RETURNS TABLE (
  at         TIMESTAMPTZ,
  action     TEXT,
  ip_address TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  RETURN QUERY
  SELECT a.created_at, a.payload ->> 'action', a.ip_address::text
  FROM auth.audit_log_entries a
  WHERE a.payload ->> 'actor_id' = p_user_id::text
  ORDER BY a.created_at DESC
  LIMIT greatest(1, least(p_limit, 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_signins(UUID, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_signins(UUID, INT) FROM anon;
