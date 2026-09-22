-- Migration 164: business approval is enforced in the DATABASE, not only in the API routes.
--
-- WHY (launch audit 2026-09-18, unit acc-bsignup)
--
-- The rules lived only in the Next.js routes:
--   * POST /api/collabs        refuses a business whose approval_status is 'rejected'
--   * POST /api/campaigns      refuses a business that is not 'approved'
--   * PATCH /api/campaigns/[id] set status 'live' had NO approval check at all
-- but the RLS policies (002, 125) only say "auth.uid() = the owner". Every app
-- client holds the Supabase URL, the anon key and the user's own JWT, so calling
-- PostgREST directly skips the routes entirely. Reproduced on the dev database
-- before this migration: a business still 'pending_review' published a LIVE
-- campaign with one POST to /rest/v1/campaigns, and a 'rejected' business sent a
-- collaboration request with one POST to /rest/v1/collab_requests (both 201).
--
-- THE RULES, exactly as the product has them (do not make them stricter here)
--   * Sending a brand -> creator request: a business awaiting review MAY send (the
--     creator sees an "unverified" flag, a 2026-07 design change); only a
--     REJECTED business is blocked.
--   * Campaigns: a business must be APPROVED to create one and to publish one.
--   * Creators (peer requests) and admins are unaffected.
--
-- These are BEFORE triggers, so they hold for every path: the API, PostgREST,
-- the SECURITY DEFINER RPCs (accept_campaign_application writes a collab_request)
-- and the service role. They are SECURITY DEFINER because the caller's JWT has no
-- column privilege on business_profiles.approval_status (AGENTS.md: column grants).

CREATE OR REPLACE FUNCTION public.guard_business_can_send_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.business_profiles bp
    WHERE bp.user_id = NEW.from_user_id AND bp.approval_status = 'rejected'
  ) THEN
    RAISE EXCEPTION 'business_not_approved'
      USING ERRCODE = '42501',
            HINT = 'A business account that was not approved cannot send collaboration requests.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS collab_requests_business_guard ON public.collab_requests;
CREATE TRIGGER collab_requests_business_guard
  BEFORE INSERT ON public.collab_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_can_send_request();

CREATE OR REPLACE FUNCTION public.guard_business_can_publish_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_status text;
BEGIN
  -- Creating a campaign in any state, or moving one to 'live' (publishing it, or
  -- reopening a closed one), needs an approved business. Every other edit passes,
  -- so a business whose approval is later withdrawn can still close its campaigns.
  IF TG_OP = 'INSERT' OR (NEW.status = 'live' AND OLD.status IS DISTINCT FROM 'live') THEN
    SELECT bp.approval_status INTO v_status
    FROM public.business_profiles bp WHERE bp.user_id = NEW.business_user_id;
    IF v_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'business_not_approved'
        USING ERRCODE = '42501',
              HINT = 'Your business account must be approved before publishing campaigns.';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS campaigns_business_guard ON public.campaigns;
CREATE TRIGGER campaigns_business_guard
  BEFORE INSERT OR UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_can_publish_campaign();

-- A real health probe (admin health can only tell "applied" from "not applied" by
-- finding an object the migration creates), and it reports the actual state.
CREATE OR REPLACE FUNCTION public.business_approval_guards_installed()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT count(*) = 2
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('collab_requests_business_guard', 'campaigns_business_guard');
$fn$;

COMMENT ON FUNCTION public.business_approval_guards_installed() IS
  'True when both database-level business approval triggers exist (migration 164).';
