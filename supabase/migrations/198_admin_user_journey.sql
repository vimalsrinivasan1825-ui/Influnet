-- Migration 198: admin_get_user_journey — one person's whole history, from the
-- day they signed up to now, in a single ordered list.
--
-- admin_get_user_activity (108 → 196) only knows the deal loop: requests,
-- terms, projects, stage work and payments. Everything else a person does —
-- signing in, accepting the terms, verifying a phone, claiming a social
-- handle, posting a campaign, applying to one, opening a ticket, reporting
-- someone, installing the app, buying Pro, what an admin did to them — was
-- spread over a dozen console screens, so "what state is this person in, and
-- how did they get there" had no single answer.
--
-- Same rule as 073/099/108: DERIVED, NOT LOGGED. Every row here already exists
-- in its own table; this only reads them side by side. Nothing new to keep in
-- step, and history is complete back to each table's own migration.
--
-- Access, matching the API's per-tab gating (app/api/admin/users/[id]):
--   * the function needs 'users' (view), like admin_get_user_activity;
--   * each extra source is included only when the caller holds the section
--     that owns it elsewhere in the console (support, moderation, app_activity,
--     subscribers, approvals, otp). A staff member without Support never sees
--     a ticket subject here either;
--   * money and IPs are their own columns (amount_inr, ip_address), never part
--     of a title, so redactHidden() masks them for staff with those field
--     groups hidden. (admin_get_user_activity writes "Payment of ₹X" into the
--     title, where no mask can reach it — and reads paise as rupees.)
--   * the admin who acted is named (admin_email) only for callers holding
--     'team'; everyone else sees "the Influnet team".
--
-- admin_get_user_activity is left untouched so the old Timeline keeps working
-- on a database where this migration has not been applied yet.

CREATE OR REPLACE FUNCTION public.admin_get_user_journey(
  p_user_id UUID,
  p_limit   INT DEFAULT 300,
  p_before  TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  at          TIMESTAMPTZ,
  kind        TEXT,
  category    TEXT,
  title       TEXT,
  detail      TEXT,
  link        TEXT,
  actor       TEXT,      -- 'self' | 'other' | 'admin' | 'system'
  amount_inr  NUMERIC,
  ip_address  TEXT,
  platform    TEXT,
  admin_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_me          UUID := p_user_id;
  v_support     BOOLEAN := public.admin_has_permission('support', 'view');
  v_moderation  BOOLEAN := public.admin_has_permission('moderation', 'view');
  v_app         BOOLEAN := public.admin_has_permission('app_activity', 'view');
  v_subscribers BOOLEAN := public.admin_has_permission('subscribers', 'view');
  v_approvals   BOOLEAN := public.admin_has_permission('approvals', 'view');
  v_otp         BOOLEAN := public.admin_has_permission('otp', 'view');
  v_campaigns   BOOLEAN := public.admin_has_permission('campaigns', 'view');
  v_feedback    BOOLEAN := public.admin_has_permission('feedback', 'view');
  v_team        BOOLEAN := public.admin_has_permission('team', 'view');
  v_user_link   TEXT;
BEGIN
  IF NOT public.admin_has_permission('users', 'view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  v_user_link := '/dashboard/admin/users/';

  RETURN QUERY
  WITH events AS (
    -- ══ Account ═════════════════════════════════════════════════════════════
    SELECT p.created_at::timestamptz AS at,
           'account_created'::text   AS kind,
           'account'::text           AS category,
           'Joined Influnet'::text   AS title,
           ('Signed up as a ' || CASE p.role::text
              WHEN 'business_owner' THEN 'brand'
              WHEN 'influencer'     THEN 'creator'
              ELSE p.role::text END)::text AS detail,
           NULL::text                AS link,
           'self'::text              AS actor,
           NULL::numeric             AS amount_inr,
           NULL::text                AS ip_address,
           NULL::text                AS platform,
           NULL::text                AS admin_email
    FROM public.profiles p WHERE p.id = v_me

    UNION ALL
    SELECT sc.terms_accepted_at, 'terms_accepted', 'account',
           'Accepted the terms (v' || sc.terms_version || ')',
           CASE WHEN sc.source IS NOT NULL THEN 'Via ' || sc.source END,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.signup_consents sc WHERE sc.user_id = v_me

    UNION ALL
    SELECT p.phone_verified_at, 'phone_verified', 'account',
           'Verified their phone number',
           CASE WHEN p.otp_verified_by IS NOT NULL THEN 'Via ' || p.otp_verified_by END,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.profiles p WHERE p.id = v_me AND p.phone_verified_at IS NOT NULL

    UNION ALL
    SELECT p.welcome_seen_at, 'welcome_seen', 'account',
           'Finished the welcome screen', NULL,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.profiles p WHERE p.id = v_me AND p.welcome_seen_at IS NOT NULL

    -- Supabase Auth's own trail: sign-ins, sign-outs, password changes.
    -- token_refreshed fires every hour a session is open; it is noise.
    UNION ALL
    SELECT a.created_at,
           'auth_' || (a.payload ->> 'action'),
           'account',
           CASE a.payload ->> 'action'
             WHEN 'login'                       THEN 'Signed in'
             WHEN 'logout'                      THEN 'Signed out'
             WHEN 'user_signedup'               THEN 'Created their login'
             WHEN 'user_repeated_signup'        THEN 'Tried to sign up again with the same address'
             WHEN 'user_recovery_requested'     THEN 'Asked for a password reset'
             WHEN 'user_updated_password'       THEN 'Changed their password'
             WHEN 'user_modified'               THEN 'Changed their login details'
             WHEN 'user_confirmation_requested' THEN 'Was sent a confirmation email'
             WHEN 'user_reauthenticate_requested' THEN 'Was asked to re-authenticate'
             ELSE 'Auth: ' || (a.payload ->> 'action') END,
           NULLIF(a.payload -> 'traits' ->> 'provider', ''),
           NULL, 'self', NULL, a.ip_address::text, NULL, NULL
    FROM auth.audit_log_entries a
    WHERE a.payload ->> 'actor_id' = v_me::text
      AND coalesce(a.payload ->> 'action', '') NOT IN ('token_refreshed', 'token_revoked')

    -- ══ Profile ═════════════════════════════════════════════════════════════
    UNION ALL
    SELECT ip.username_changed_at, 'username_changed', 'profile',
           'Changed their username', '@' || ip.username,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.influencer_profiles ip
    WHERE ip.user_id = v_me AND ip.username_changed_at IS NOT NULL

    UNION ALL
    SELECT bp.username_changed_at, 'username_changed', 'profile',
           'Changed their username', '@' || bp.username,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.business_profiles bp
    WHERE bp.user_id = v_me AND bp.username_changed_at IS NOT NULL

    UNION ALL
    SELECT pi.created_at, 'portfolio_item_added', 'profile',
           'Added a portfolio piece',
           concat_ws(' · ', pi.title, pi.brand_name, pi.platform),
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.creator_portfolio_items pi WHERE pi.user_id = v_me

    -- Profiles this person looked at, and who looked at theirs.
    UNION ALL
    SELECT pv.viewed_at, 'viewed_profile', 'profile',
           'Viewed ' || coalesce(o.name, 'a creator') || '''s profile', NULL,
           v_user_link || pv.influencer_user_id::text, 'self', NULL, NULL, NULL, NULL
    FROM public.profile_views pv
    LEFT JOIN public.profiles o ON o.id = pv.influencer_user_id
    WHERE pv.viewer_user_id = v_me

    UNION ALL
    SELECT pv.viewed_at, 'profile_viewed_by', 'profile',
           'Profile viewed by ' || coalesce(o.name, pv.viewer_name, 'someone'),
           pv.viewer_industry,
           CASE WHEN pv.viewer_user_id IS NOT NULL THEN v_user_link || pv.viewer_user_id::text END,
           'other', NULL, NULL, NULL, NULL
    FROM public.profile_views pv
    LEFT JOIN public.profiles o ON o.id = pv.viewer_user_id
    WHERE pv.influencer_user_id = v_me

    UNION ALL
    SELECT bv.viewed_at, 'viewed_profile', 'profile',
           'Viewed ' || coalesce(o.name, 'a brand') || '''s profile', NULL,
           v_user_link || bv.business_user_id::text, 'self', NULL, NULL, NULL, NULL
    FROM public.business_profile_views bv
    LEFT JOIN public.profiles o ON o.id = bv.business_user_id
    WHERE bv.viewer_user_id = v_me

    UNION ALL
    SELECT bv.viewed_at, 'profile_viewed_by', 'profile',
           'Profile viewed by ' || coalesce(o.name, 'someone'), NULL,
           CASE WHEN bv.viewer_user_id IS NOT NULL THEN v_user_link || bv.viewer_user_id::text END,
           'other', NULL, NULL, NULL, NULL
    FROM public.business_profile_views bv
    LEFT JOIN public.profiles o ON o.id = bv.viewer_user_id
    WHERE bv.business_user_id = v_me

    UNION ALL
    SELECT sl.created_at, 'shortlisted', 'profile',
           CASE WHEN sl.business_user_id = v_me
                THEN 'Shortlisted ' || coalesce(o.name, 'a creator')
                ELSE 'Was shortlisted by ' || coalesce(o.name, 'a brand') END,
           NULL,
           v_user_link || (CASE WHEN sl.business_user_id = v_me
                                THEN sl.influencer_user_id ELSE sl.business_user_id END)::text,
           CASE WHEN sl.business_user_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.influencer_shortlists sl
    LEFT JOIN public.profiles o
      ON o.id = CASE WHEN sl.business_user_id = v_me THEN sl.influencer_user_id ELSE sl.business_user_id END
    WHERE sl.business_user_id = v_me OR sl.influencer_user_id = v_me

    -- ══ Verification ════════════════════════════════════════════════════════
    UNION ALL
    SELECT p.verified_at, 'verified', 'verification',
           'Account verified', NULL,
           NULL, 'system', NULL, NULL, NULL, NULL
    FROM public.profiles p WHERE p.id = v_me AND p.verified_at IS NOT NULL

    UNION ALL
    SELECT vc.created_at, 'verification_submitted', 'verification',
           'Verification check started',
           CASE WHEN vc.ai_score IS NOT NULL THEN 'Automatic score ' || round(vc.ai_score, 2)::text END,
           '/dashboard/admin/approvals', 'system', NULL, NULL, NULL, NULL
    FROM public.verification_checks vc WHERE v_approvals AND vc.user_id = v_me

    UNION ALL
    SELECT vc.decided_at, 'verification_' || vc.status, 'verification',
           'Verification ' || replace(vc.status, '_', ' '),
           coalesce(vc.reviewer_notes, vc.ai_reason),
           '/dashboard/admin/approvals',
           CASE WHEN vc.decided_by = 'ai' OR vc.decided_by IS NULL THEN 'system' ELSE 'admin' END,
           NULL, NULL, NULL, NULL
    FROM public.verification_checks vc
    WHERE v_approvals AND vc.user_id = v_me AND vc.decided_at IS NOT NULL

    UNION ALL
    SELECT sc.created_at, 'social_claim_started', 'verification',
           'Started verifying ' || sc.platform || ' @' || sc.handle, NULL,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.social_account_claims sc WHERE v_approvals AND sc.user_id = v_me

    UNION ALL
    SELECT sc.verified_at, 'social_claim_verified', 'verification',
           'Proved they own ' || sc.platform || ' @' || sc.handle, NULL,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.social_account_claims sc
    WHERE v_approvals AND sc.user_id = v_me AND sc.verified_at IS NOT NULL

    UNION ALL
    SELECT ec.verified_at, 'email_domain_verified', 'verification',
           'Verified a work email address', split_part(ec.email, '@', 2),
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.email_domain_claims ec
    WHERE v_approvals AND ec.user_id = v_me AND ec.verified_at IS NOT NULL

    UNION ALL
    SELECT o.created_at, 'otp_' || o.action, 'verification',
           'Phone code ' || replace(o.action, '_', ' '),
           o.status,
           NULL, 'self', NULL, NULL, NULL, NULL
    FROM public.phone_otp_audit_log o WHERE v_otp AND o.user_id = v_me

    -- ══ Campaigns (open marketplace) ════════════════════════════════════════
    UNION ALL
    SELECT c.created_at, 'campaign_created', 'campaigns',
           'Created campaign "' || c.title || '"', c.status,
           '/dashboard/admin/campaigns', 'self', NULL, NULL, NULL, NULL
    FROM public.campaigns c WHERE v_campaigns AND c.business_user_id = v_me

    UNION ALL
    SELECT c.published_at, 'campaign_published', 'campaigns',
           'Published campaign "' || c.title || '"', NULL,
           '/dashboard/admin/campaigns', 'self', NULL, NULL, NULL, NULL
    FROM public.campaigns c
    WHERE v_campaigns AND c.business_user_id = v_me AND c.published_at IS NOT NULL

    UNION ALL
    SELECT ca.created_at, 'campaign_applied', 'campaigns',
           'Applied to "' || coalesce(c.title, 'a campaign') || '"',
           'By ' || coalesce(b.company_name, 'a brand'),
           '/dashboard/admin/campaigns', 'self', ca.proposed_rate, NULL, NULL, NULL
    FROM public.campaign_applications ca
    LEFT JOIN public.campaigns c ON c.id = ca.campaign_id
    LEFT JOIN public.business_profiles b ON b.user_id = c.business_user_id
    WHERE v_campaigns AND ca.creator_user_id = v_me

    UNION ALL
    SELECT ca.created_at, 'campaign_application_received', 'campaigns',
           coalesce(o.name, 'A creator') || ' applied to "' || c.title || '"', NULL,
           v_user_link || ca.creator_user_id::text, 'other', ca.proposed_rate, NULL, NULL, NULL
    FROM public.campaign_applications ca
    JOIN public.campaigns c ON c.id = ca.campaign_id
    LEFT JOIN public.profiles o ON o.id = ca.creator_user_id
    WHERE v_campaigns AND c.business_user_id = v_me

    UNION ALL
    SELECT ca.resolved_at, 'campaign_application_' || ca.status, 'campaigns',
           'Application ' || ca.status || ' — "' || coalesce(c.title, 'a campaign') || '"', NULL,
           '/dashboard/admin/campaigns',
           CASE WHEN ca.creator_user_id = v_me AND ca.status = 'withdrawn' THEN 'self'
                WHEN c.business_user_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.campaign_applications ca
    LEFT JOIN public.campaigns c ON c.id = ca.campaign_id
    WHERE v_campaigns AND ca.resolved_at IS NOT NULL
      AND (ca.creator_user_id = v_me OR c.business_user_id = v_me)

    -- ══ Collaboration requests (copied from admin_get_user_activity) ════════
    UNION ALL
    SELECT cr.created_at,
           CASE WHEN cr.from_user_id = v_me THEN 'request_sent' ELSE 'request_received' END,
           'deals',
           CASE WHEN cr.from_user_id = v_me
                THEN 'Sent a collaboration request to ' || coalesce(o.name, 'someone')
                ELSE 'Received a collaboration request from ' || coalesce(o.name, 'someone') END,
           nullif(split_part(cr.message, E'\n', 1), ''),
           v_user_link || o.id::text,
           CASE WHEN cr.from_user_id = v_me THEN 'self' ELSE 'other' END,
           cr.budget, NULL, NULL, NULL
    FROM public.collab_requests cr
    JOIN public.profiles o
      ON o.id = CASE WHEN cr.from_user_id = v_me THEN cr.to_user_id ELSE cr.from_user_id END
    WHERE cr.from_user_id = v_me OR cr.to_user_id = v_me

    UNION ALL
    SELECT cr.updated_at, 'request_' || cr.status::text, 'deals',
           'Request ' || cr.status::text || ' — with ' || coalesce(o.name, 'someone'), NULL,
           v_user_link || o.id::text,
           CASE WHEN cr.status::text = 'cancelled'
                THEN CASE WHEN cr.from_user_id = v_me THEN 'self' ELSE 'other' END
                ELSE CASE WHEN cr.to_user_id = v_me THEN 'self' ELSE 'other' END END,
           NULL, NULL, NULL, NULL
    FROM public.collab_requests cr
    JOIN public.profiles o
      ON o.id = CASE WHEN cr.from_user_id = v_me THEN cr.to_user_id ELSE cr.from_user_id END
    WHERE (cr.from_user_id = v_me OR cr.to_user_id = v_me)
      AND cr.status::text <> 'pending'

    UNION ALL
    SELECT pp.created_at, 'terms_proposed', 'deals',
           CASE WHEN pp.proposed_by = v_me THEN 'Proposed project terms' ELSE 'Received project terms' END,
           pp.title,
           CASE WHEN pp.project_id IS NOT NULL THEN '/dashboard/admin/projects/' || pp.project_id::text END,
           CASE WHEN pp.proposed_by = v_me THEN 'self' ELSE 'other' END,
           pp.budget, NULL, NULL, NULL
    FROM public.project_proposals pp
    JOIN public.collab_requests cr ON cr.id = pp.collab_request_id
    WHERE cr.from_user_id = v_me OR cr.to_user_id = v_me

    UNION ALL
    SELECT pp.resolved_at, 'terms_' || pp.status, 'deals',
           'Terms ' || pp.status, pp.title || coalesce(' · ' || pp.review_note, ''),
           CASE WHEN pp.project_id IS NOT NULL THEN '/dashboard/admin/projects/' || pp.project_id::text END,
           CASE WHEN pp.resolved_by = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.project_proposals pp
    JOIN public.collab_requests cr ON cr.id = pp.collab_request_id
    WHERE (cr.from_user_id = v_me OR cr.to_user_id = v_me)
      AND pp.status <> 'pending' AND pp.resolved_at IS NOT NULL

    -- ══ Projects ════════════════════════════════════════════════════════════
    UNION ALL
    SELECT coalesce(cp.accepted_at, cp.created_at), 'project_started', 'projects',
           'Project started — ' || cp.title,
           'With ' || coalesce(o.name, 'a deleted account'),
           '/dashboard/admin/projects/' || cp.id::text,
           CASE WHEN cp.created_by_user_id = v_me THEN 'self' ELSE 'other' END,
           cp.budget, NULL, NULL, NULL
    FROM public.campaign_projects cp
    LEFT JOIN public.profiles o
      ON o.id = CASE WHEN cp.owner_user_id = v_me THEN cp.counterparty_user_id ELSE cp.owner_user_id END
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status <> 'pending_acceptance'

    UNION ALL
    SELECT coalesce(cp.completed_at, cp.updated_at), 'project_completed', 'projects',
           'Project completed — ' || cp.title, NULL,
           '/dashboard/admin/projects/' || cp.id::text, 'self', NULL, NULL, NULL, NULL
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'completed'

    UNION ALL
    SELECT cp.cancelled_at, 'project_cancelled', 'projects',
           'Project cancelled — ' || cp.title, cp.cancellation_reason,
           '/dashboard/admin/projects/' || cp.id::text,
           CASE WHEN cp.cancelled_by = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.campaign_projects cp
    WHERE (cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me)
      AND cp.status = 'cancelled' AND cp.cancelled_at IS NOT NULL

    UNION ALL
    SELECT pa.created_at, pa.type, 'projects', pa.summary, cp.title,
           '/dashboard/admin/projects/' || cp.id::text,
           CASE WHEN pa.actor_user_id = v_me THEN 'self'
                WHEN pa.actor_user_id IS NULL THEN 'system' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.project_activity pa
    JOIN public.campaign_projects cp ON cp.id = pa.project_id
    WHERE cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me

    UNION ALL
    SELECT r.created_at,
           CASE WHEN r.from_user_id = v_me THEN 'review_given' ELSE 'review_received' END,
           'projects',
           CASE WHEN r.from_user_id = v_me
                THEN 'Left a ' || r.rating || '★ review for ' || coalesce(o.name, 'their partner')
                ELSE 'Received a ' || r.rating || '★ review from ' || coalesce(o.name, 'their partner') END,
           left(r.comment, 140),
           '/dashboard/admin/projects/' || r.project_id::text,
           CASE WHEN r.from_user_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.reviews r
    LEFT JOIN public.profiles o
      ON o.id = CASE WHEN r.from_user_id = v_me THEN r.to_user_id ELSE r.from_user_id END
    WHERE r.from_user_id = v_me OR r.to_user_id = v_me

    UNION ALL
    SELECT br.created_at,
           CASE WHEN br.reviewer_user_id = v_me THEN 'brand_review_given' ELSE 'brand_review_received' END,
           'projects',
           CASE WHEN br.reviewer_user_id = v_me
                THEN 'Reviewed a brand (' || br.rating || '★)'
                ELSE 'Brand received a ' || br.rating || '★ review' END,
           br.campaign_name,
           NULL,
           CASE WHEN br.reviewer_user_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.business_reviews br
    WHERE br.reviewer_user_id = v_me OR br.business_user_id = v_me

    -- ══ Money ═══════════════════════════════════════════════════════════════
    UNION ALL
    SELECT coalesce(pay.paid_at, pay.created_at), 'payment_' || pay.status, 'money',
           CASE pay.status
             WHEN 'paid'     THEN 'Project payment settled'
             WHEN 'created'  THEN 'Project payment started'
             WHEN 'failed'   THEN 'Project payment failed'
             WHEN 'refunded' THEN 'Project payment refunded'
             ELSE 'Project payment ' || pay.status END,
           cp.title || ' · ' || replace(pay.stage_key, '_', ' ')
             || coalesce(' · ' || pay.failure_reason, ''),
           '/dashboard/admin/projects/' || cp.id::text,
           CASE WHEN pay.payer_id = v_me THEN 'self' ELSE 'other' END,
           round(pay.amount / 100.0, 2), NULL, NULL, NULL
    FROM public.project_payments pay
    JOIN public.campaign_projects cp ON cp.id = pay.project_id
    WHERE cp.owner_user_id = v_me OR cp.counterparty_user_id = v_me

    UNION ALL
    SELECT coalesce(po.paid_at, po.created_at), 'pro_order_' || po.status, 'money',
           CASE po.status
             WHEN 'paid'   THEN CASE WHEN po.is_renewal THEN 'Renewed Pro' ELSE 'Bought Pro' END
             WHEN 'failed' THEN 'Pro payment failed'
             ELSE 'Pro checkout ' || po.status END,
           po.failure_reason,
           NULL, 'self', round(po.amount_paise / 100.0, 2), NULL, NULL, NULL
    FROM public.pro_orders po WHERE v_subscribers AND po.user_id = v_me

    UNION ALL
    SELECT s.created_at, 'subscription_created', 'money',
           'Subscription record created (' || s.tier::text || ', ' || s.status || ')', NULL,
           NULL, 'system', NULL, NULL, NULL, NULL
    FROM public.subscriptions s WHERE v_subscribers AND s.user_id = v_me

    UNION ALL
    SELECT be.received_at, 'billing_' || be.kind, 'money',
           'Billing: ' || replace(be.kind, '.', ' '), NULL,
           NULL, 'system', NULL, NULL, NULL, NULL
    FROM public.billing_events be WHERE v_subscribers AND be.user_id = v_me

    -- ══ Support & safety ════════════════════════════════════════════════════
    UNION ALL
    SELECT t.created_at, 'support_opened', 'support',
           'Opened a support ticket: ' || t.subject, t.category,
           '/dashboard/admin/support', 'self', NULL, NULL, NULL, NULL
    FROM public.support_tickets t WHERE v_support AND t.user_id = v_me

    UNION ALL
    SELECT t.resolved_at, 'support_resolved', 'support',
           'Support ticket resolved: ' || t.subject, NULL,
           '/dashboard/admin/support', 'admin', NULL, NULL, NULL, NULL
    FROM public.support_tickets t
    WHERE v_support AND t.user_id = v_me AND t.resolved_at IS NOT NULL

    UNION ALL
    SELECT f.created_at, 'feedback_' || f.kind, 'support',
           'Sent ' || replace(f.kind, '_', ' ') || ' feedback', left(f.message, 140),
           '/dashboard/admin/feedback', 'self', NULL, NULL, NULL, NULL
    FROM public.product_feedback f WHERE v_feedback AND f.user_id = v_me

    UNION ALL
    SELECT ur.created_at,
           CASE WHEN ur.reporter_id = v_me THEN 'reported_someone' ELSE 'was_reported' END,
           'safety',
           CASE WHEN ur.reporter_id = v_me
                THEN 'Reported ' || coalesce(o.name, 'an account')
                ELSE 'Was reported by ' || coalesce(o.name, 'an account') END,
           ur.reason || ' · ' || ur.status,
           '/dashboard/admin/reports',
           CASE WHEN ur.reporter_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.user_reports ur
    LEFT JOIN public.profiles o
      ON o.id = CASE WHEN ur.reporter_id = v_me THEN ur.reported_id ELSE ur.reporter_id END
    WHERE v_moderation AND (ur.reporter_id = v_me OR ur.reported_id = v_me)

    UNION ALL
    SELECT ub.created_at,
           CASE WHEN ub.blocker_id = v_me THEN 'blocked_someone' ELSE 'was_blocked' END,
           'safety',
           CASE WHEN ub.blocker_id = v_me
                THEN 'Blocked ' || coalesce(o.name, 'an account')
                ELSE 'Was blocked by ' || coalesce(o.name, 'an account') END,
           NULL,
           v_user_link || o.id::text,
           CASE WHEN ub.blocker_id = v_me THEN 'self' ELSE 'other' END,
           NULL, NULL, NULL, NULL
    FROM public.user_blocks ub
    LEFT JOIN public.profiles o
      ON o.id = CASE WHEN ub.blocker_id = v_me THEN ub.blocked_id ELSE ub.blocker_id END
    WHERE v_moderation AND (ub.blocker_id = v_me OR ub.blocked_id = v_me)

    -- ══ App usage ═══════════════════════════════════════════════════════════
    UNION ALL
    SELECT d.created_at, 'device_registered', 'usage',
           'Installed the app on ' || d.platform,
           concat_ws(' · ', 'v' || d.app_version, d.os_version, 'notifications ' || d.permission),
           NULL, 'self', NULL, NULL, d.platform, NULL
    FROM public.push_devices d WHERE v_app AND d.user_id = v_me

    UNION ALL
    SELECT d.disabled_at, 'device_disabled', 'usage',
           'Stopped receiving notifications on ' || d.platform, d.disabled_reason,
           NULL, 'system', NULL, NULL, d.platform, NULL
    FROM public.push_devices d WHERE v_app AND d.user_id = v_me AND d.disabled_at IS NOT NULL

    -- One row per active day and platform (migration 152). The newest-first
    -- order puts these next to whatever they did that day.
    UNION ALL
    SELECT a.first_seen_at, 'active_day', 'usage',
           'Used Influnet on ' || a.platform,
           a.hits || ' request' || CASE WHEN a.hits = 1 THEN '' ELSE 's' END
             || coalesce(' · v' || a.app_version, ''),
           NULL, 'self', NULL, NULL, a.platform, NULL
    FROM public.user_daily_activity a WHERE v_app AND a.user_id = v_me

    -- ══ What the Influnet team did to this account ═════════════════════════
    -- user_viewed is only interesting to whoever audits the admins.
    UNION ALL
    SELECT al.created_at, 'admin_' || al.action, 'admin',
           CASE al.action
             WHEN 'business_approval_changed' THEN
               'Business ' || coalesce(al.metadata ->> 'approval_status', 'decision') || ' by the Influnet team'
             WHEN 'verification_decided' THEN 'Verification decided by the Influnet team'
             WHEN 'user_updated'   THEN 'Details edited by the Influnet team'
             WHEN 'user_viewed'    THEN 'Opened in the admin console'
             WHEN 'user_nudged'    THEN 'Sent a nudge by the Influnet team'
             WHEN 'support_replied' THEN 'Support replied'
             ELSE replace(al.action, '_', ' ') END,
           CASE WHEN al.action = 'user_updated'
                THEN 'Changed ' || coalesce((SELECT string_agg(f, ', ') FROM jsonb_array_elements_text(al.metadata -> 'fields') f), 'fields')
                ELSE nullif(al.metadata ->> 'reason', '') END,
           NULL, 'admin', NULL,
           CASE WHEN v_team THEN al.ip_address END,
           NULL,
           CASE WHEN v_team THEN al.actor_email END
    FROM public.admin_audit_log al
    WHERE al.target_id = v_me
      AND (al.action <> 'user_viewed' OR v_team)
  )
  SELECT e.at, e.kind, e.category, e.title, e.detail, e.link, e.actor,
         e.amount_inr, e.ip_address, e.platform, e.admin_email
  FROM events e
  WHERE e.at IS NOT NULL
    AND (p_before IS NULL OR e.at < p_before)
  ORDER BY e.at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 300), 500));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_journey(UUID, INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_user_journey(UUID, INT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.admin_get_user_journey(UUID, INT, TIMESTAMPTZ) IS
  'Admin: one user''s full history (account, profile, verification, campaigns, deals, projects, money, support, safety, app usage, admin actions), newest first. Sections gated per caller; see migration 198.';
