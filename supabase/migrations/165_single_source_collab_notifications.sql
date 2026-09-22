-- Migration 165: a collaboration request produces ONE notification, not two.
--
-- WHY (found by the phase-9 end-to-end walk, 2026-09-19, unit ntf-inapp / req-peer)
--
-- Migration 047 (July) put notifications on triggers: on_collab_request_insert
-- wrote "New Collaboration Request" to the recipient, on_collab_request_update wrote
-- "Request Accepted / Declined" to the sender. Later the API routes grew notifyUser()
-- (in-app row + push + optional email), which sends the same events: POST /api/collabs,
-- POST /api/collabs/peer, and PATCH /api/collabs (accept / decline / reopen). Both
-- kept firing, so EVERY request, brand or peer, showed the recipient two identical
-- items in the bell and doubled the unread count. Reproduced on dev: one peer request
-- and one brand request each gained 2 notifications for the recipient.
--
-- The trigger was also the wrong source on two paths:
--   * accept_campaign_application() (129) writes a collab_request itself; the insert
--     trigger told the creator "New Collaboration Request from <brand>" when a brand had
--     just accepted THEIR application, and the update trigger told the BRAND that the
--     creator had accepted (the brand was the one who acted).
--   * deal-flow RPCs (065, 069) set status = 'accepted' and fired "Request Accepted" at
--     the sender, usually the person who had just acted.
--
-- FIX: the routes are the single source (notifyUser is the canonical sender: it also
-- pushes, and it has the per-template kill switches). Drop the triggers and their
-- functions. The one path that relied on the trigger alone, accepting a campaign
-- application, now notifies the applicant explicitly in its route (same commit series).
-- Existing duplicate rows are left as history.

DROP TRIGGER IF EXISTS on_collab_request_insert ON public.collab_requests;
DROP TRIGGER IF EXISTS on_collab_request_update ON public.collab_requests;
DROP FUNCTION IF EXISTS public.handle_new_collab_request();
DROP FUNCTION IF EXISTS public.handle_update_collab_request();

-- A real health probe (the page can only tell "applied" by finding an object this
-- migration creates), and it reports the actual state: true = neither trigger exists.
CREATE OR REPLACE FUNCTION public.collab_notifications_single_source()
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.collab_requests'::regclass
      AND NOT tgisinternal
      AND tgname IN ('on_collab_request_insert', 'on_collab_request_update')
  );
$fn$;

COMMENT ON FUNCTION public.collab_notifications_single_source() IS
  'True when the duplicate collab notification triggers from migration 047 are gone (migration 165).';
