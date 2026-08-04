-- 104: reusable check for "has this creator proven they own their Instagram".
--
-- Backs the new signup-completion gate: a creator who skips or hasn't yet
-- finished the bio-link handshake (social_account_claims, 058) is restricted
-- from creator-to-business actions (sending a request, sending a message,
-- accepting a project) until they do. Enforcement itself lives in the API
-- routes (apps/web/src/lib/ownership-gate.ts) behind OWNERSHIP_GATE_ENABLED —
-- this migration only adds the read, so the gate has one source of truth
-- instead of every route re-deriving it.

CREATE OR REPLACE FUNCTION public.has_verified_instagram_ownership(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.social_account_claims
    WHERE user_id = p_user_id
      AND platform = 'instagram'
      AND status = 'verified'
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_verified_instagram_ownership(UUID) TO authenticated;
