-- Migration 086: admin approval can no longer verify a creator without
-- proven ownership.
--
-- WHY THIS EXISTS
--
-- The automated scorer (decide() in lib/verification.ts) already refuses to
-- auto-approve a creator without a confirmed social_account_claims row (the
-- bio-code ownership handshake, migration 058) — see verification.ts:133,
-- the "ANTI-IMPERSONATION GATE" comment. But admin_decide_verification()
-- (migration 055) has NO equivalent gate: an admin calling it with
-- p_status='verified' sets the badge live regardless of ownership state.
--
-- This is not hypothetical. Live data on 2026-07-28: creator "a2d" (A2D Army)
-- has a social_account_claims row stuck at status='pending' — the ownership
-- code was issued but never confirmed in their bio — yet verification_checks
-- shows FOUR admin decisions (07-20, 07-26 x2, 07-28) each setting status to
-- 'verified', on top of the automated scorer correctly re-flagging them
-- 'in_review' with ownership_verified:false every single time it re-ran.
-- The admin override path was silently defeating the anti-impersonation gate
-- it was supposed to sit alongside.
--
-- Fix: for influencer approvals specifically (businesses verify through
-- different evidence and are intentionally not gated — see the same comment
-- in verification.ts), admin_decide_verification() now requires a verified
-- social_account_claims row to exist before it will accept p_status='verified'.
-- No amount of admin judgment can substitute for actual proof of ownership;
-- the admin can still set 'rejected', 'needs_more_info', or 'in_review'
-- freely, and can set 'verified' once ownership is actually confirmed.

CREATE OR REPLACE FUNCTION public.admin_decide_verification(
  p_user_id     uuid,
  p_status      text,
  p_notes       text,
  p_notif_type  text,
  p_notif_title text,
  p_notif_body  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urole text;
  ownership_ok boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_status NOT IN ('verified', 'rejected', 'needs_more_info', 'in_review') THEN
    RAISE EXCEPTION 'Invalid admin status: %', p_status;
  END IF;

  SELECT role INTO urole FROM public.profiles WHERE id = p_user_id;

  -- ANTI-IMPERSONATION GATE, admin side: mirrors the automated gate in
  -- verification.ts decide(). A creator cannot be marked 'verified' — by
  -- anyone, including an admin — without a completed bio-code ownership
  -- handshake. This is deliberately NOT overridable: "the admin trusts this
  -- account" is not proof of who controls the handle.
  IF p_status = 'verified' AND urole = 'influencer' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.social_account_claims
      WHERE user_id = p_user_id AND status = 'verified'
    ) INTO ownership_ok;
    IF NOT ownership_ok THEN
      RAISE EXCEPTION
        'Cannot verify this creator: ownership of their social handle has not been confirmed yet (no verified social_account_claims row). Ask them to complete the bio-code verification first, or set status to in_review / needs_more_info instead.';
    END IF;
  END IF;

  -- Resolve the latest open check (if any) for the audit trail.
  UPDATE public.verification_checks
    SET status = p_status, reviewer_notes = p_notes, decided_by = auth.uid()::text, decided_at = now()
  WHERE id = (
    SELECT id FROM public.verification_checks
    WHERE user_id = p_user_id AND status IN ('pending', 'in_review')
    ORDER BY created_at DESC LIMIT 1
  );

  UPDATE public.profiles SET verification_status = p_status, updated_at = now()
  WHERE id = p_user_id;

  -- Keep legacy business approval_status in sync so the old admin screen agrees.
  IF urole = 'business_owner' THEN
    UPDATE public.business_profiles
      SET approval_status = CASE WHEN p_status = 'verified' THEN 'approved'
                                 WHEN p_status = 'rejected' THEN 'rejected'
                                 ELSE 'pending_review' END,
          updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, p_notif_type, p_notif_title, p_notif_body, '/dashboard/settings');

  RETURN jsonb_build_object('user_id', p_user_id, 'status', p_status);
END;
$$;

-- ---------------------------------------------------------------------------
-- Retroactively fix the A2D Army case (and anyone else in the same state):
-- downgrade any influencer currently sitting at verification_status='verified'
-- without a verified ownership claim back to 'in_review', so the badge that
-- was granted through the now-closed loophole stops showing to businesses as
-- a proven trust signal. Their verification_checks audit history is left
-- untouched — this only fixes the live-facing status.
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET verification_status = 'in_review', updated_at = now()
WHERE p.role = 'influencer'
  AND p.verification_status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM public.social_account_claims c
    WHERE c.user_id = p.id AND c.status = 'verified'
  );
