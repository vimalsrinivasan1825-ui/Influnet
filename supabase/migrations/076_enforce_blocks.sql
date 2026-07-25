-- Migration 076: enforce user_blocks — until now, blocking recorded a row
-- (POST /api/blocks) but nothing ever consulted it. A blocked user could
-- still send collaboration requests to the person who blocked them; a
-- repository-wide search found `user_blocks` referenced in exactly one file.
--
-- Enforced at the database via a RESTRICTIVE policy so no future INSERT path
-- on collab_requests — API route, RPC, or otherwise — can forget it. The API
-- route also checks explicitly first, so the requester gets a clear message
-- instead of a bare RLS violation.

CREATE OR REPLACE FUNCTION public.is_blocked_pair(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- SECURITY DEFINER: a blocked-in-either-direction check has to see the
  -- OTHER party's block row too, and user_blocks' own SELECT policy only
  -- lets a user see rows where they are the blocker.
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked_pair(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(UUID, UUID) TO authenticated;

-- RESTRICTIVE policies AND with permissive ones rather than OR, so this adds
-- a hard requirement on top of collab_requests_insert_from without touching
-- (or needing to understand every detail of) that existing policy.
DROP POLICY IF EXISTS collab_requests_insert_not_blocked ON public.collab_requests;
CREATE POLICY collab_requests_insert_not_blocked
  ON public.collab_requests AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_blocked_pair(from_user_id, to_user_id));
