-- Migration 157: admin broadcasts — push, in-app pop-ups, tutorials, email
--
-- WHY (docs/product/ADMIN_CRM_ANALYSIS_2026-09-17.md §5): the admin could not
-- send anything to anyone. notifyUser() pushes to ONE user for a product event;
-- there was no audience targeting, scheduling, recurrence, delivery log,
-- receipts, open tracking, in-app announcement, or marketing opt-out.
--
-- Shape:
--   broadcasts            what the admin composed (+ schedule / recurrence)
--   broadcast_runs        one actual send of a broadcast (recurring → many)
--   broadcast_deliveries  one row per recipient × channel × device — the queue
--                         AND the log. UNIQUE makes every retry idempotent.
--   announcement_views    seen / dismissed / clicked for in-app banners/modals
--   notification_preferences  per-category push/email opt-out
--
-- Sending lives in TypeScript (lib/broadcasts.ts), driven by
-- POST /api/cron/broadcasts. SQL owns: audience resolution, enqueueing with
-- opt-out / frequency cap / quiet hours, claiming with SKIP LOCKED, stats.
--
-- Every table is service-role only. Admin reads go through is_admin() RPCs;
-- admin writes go through API routes that ran withAdmin() and audit.

-- ── 1. Tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  kind                TEXT NOT NULL CHECK (kind IN ('announcement', 'promo', 'tutorial', 'system', 'reminder')),
  title               TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 65),
  body                TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  image_url           TEXT CHECK (image_url IS NULL OR image_url ~ '^https://'),
  deep_link           TEXT CHECK (deep_link IS NULL OR deep_link ~ '^/[A-Za-z0-9/_\-?=&.%]*$'),
  cta_label           TEXT CHECK (char_length(cta_label) <= 30),
  guide_id            TEXT,
  channels            TEXT[] NOT NULL CHECK (channels <@ ARRAY['push', 'in_app', 'email']::TEXT[] AND cardinality(channels) > 0),
  in_app_style        TEXT NOT NULL DEFAULT 'toast' CHECK (in_app_style IN ('toast', 'banner', 'modal')),
  audience            JSONB NOT NULL DEFAULT '{}'::jsonb,
  frequency           TEXT NOT NULL DEFAULT 'once' CHECK (frequency IN ('once', 'daily', 'weekly', 'monthly')),
  send_at             TIMESTAMPTZ,
  by_weekday          SMALLINT[] CHECK (by_weekday IS NULL OR by_weekday <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]),
  by_monthday         SMALLINT CHECK (by_monthday BETWEEN 1 AND 28),
  time_ist            TIME,
  starts_on           DATE,
  ends_on             DATE,
  respect_quiet_hours BOOLEAN NOT NULL DEFAULT TRUE,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')),
  system_owned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by          UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_by         UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  last_run_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT broadcasts_schedule_shape CHECK (
    (frequency = 'once')
    OR (frequency = 'daily'   AND time_ist IS NOT NULL)
    OR (frequency = 'weekly'  AND time_ist IS NOT NULL AND cardinality(by_weekday) > 0)
    OR (frequency = 'monthly' AND time_ist IS NOT NULL AND by_monthday IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS broadcasts_status_idx ON public.broadcasts (status, send_at);

DROP TRIGGER IF EXISTS broadcasts_updated_at ON public.broadcasts;
CREATE TRIGGER broadcasts_updated_at BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.broadcast_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  is_test       BOOLEAN NOT NULL DEFAULT FALSE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  targeted      INT NOT NULL DEFAULT 0,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb
);
-- A double scheduler tick cannot create two real runs for the same slot.
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_runs_slot_uidx
  ON public.broadcast_runs (broadcast_id, scheduled_for) WHERE NOT is_test;

CREATE TABLE IF NOT EXISTS public.broadcast_deliveries (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id          UUID NOT NULL REFERENCES public.broadcast_runs (id) ON DELETE CASCADE,
  broadcast_id    UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  channel         TEXT NOT NULL CHECK (channel IN ('push', 'in_app', 'email')),
  device_id       UUID REFERENCES public.push_devices (id) ON DELETE SET NULL,
  expo_token      TEXT,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'deferred', 'sending', 'skipped', 'sent', 'delivered', 'error')),
  skip_reason     TEXT,     -- opted_out | frequency_cap | no_device | no_email
  not_before      TIMESTAMPTZ,
  attempts        INT NOT NULL DEFAULT 0,
  claimed_at      TIMESTAMPTZ,
  expo_ticket_id  TEXT,
  error_code      TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS broadcast_deliveries_once_uidx
  ON public.broadcast_deliveries (run_id, user_id, channel, COALESCE(device_id, '00000000-0000-0000-0000-000000000000'::UUID));
CREATE INDEX IF NOT EXISTS broadcast_deliveries_queue_idx
  ON public.broadcast_deliveries (channel, status, not_before) WHERE status IN ('queued', 'deferred', 'sending');
CREATE INDEX IF NOT EXISTS broadcast_deliveries_receipt_idx
  ON public.broadcast_deliveries (sent_at) WHERE status = 'sent' AND channel = 'push';
CREATE INDEX IF NOT EXISTS broadcast_deliveries_user_idx
  ON public.broadcast_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS broadcast_deliveries_run_idx
  ON public.broadcast_deliveries (run_id, status);

CREATE TABLE IF NOT EXISTS public.announcement_views (
  user_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  seen_at      TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  PRIMARY KEY (user_id, broadcast_id)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  category   TEXT NOT NULL CHECK (category IN ('announcements', 'promotions', 'tips')),
  push       BOOLEAN NOT NULL DEFAULT TRUE,
  email      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE public.broadcasts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_deliveries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_views       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.broadcasts, public.broadcast_runs, public.broadcast_deliveries,
              public.announcement_views, public.notification_preferences FROM anon, authenticated;

-- ── 2. Kind → opt-out category ─────────────────────────────────────────────
-- system / reminder are service messages: no marketing opt-out applies, but
-- they are still never sent to someone with no device/email.
CREATE OR REPLACE FUNCTION public.broadcast_category(p_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'announcement' THEN 'announcements'
    WHEN 'promo'        THEN 'promotions'
    WHEN 'tutorial'     THEN 'tips'
    ELSE NULL
  END;
$$;

-- ── 3. Audience resolution ─────────────────────────────────────────────────
-- A segment is a whitelisted JSON object; unknown keys RAISE so a typo can
-- never silently widen the audience to everyone.
CREATE OR REPLACE FUNCTION public.broadcast_audience_ids(p_segment JSONB)
RETURNS TABLE (user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seg   JSONB := coalesce(p_segment, '{}'::jsonb);
  v_key   TEXT;
  v_allowed TEXT[] := ARRAY['role', 'creator_verification', 'business_approval', 'tier',
                            'pro_expiring_within_days', 'active_within_days', 'dormant_for_days',
                            'signed_up_from', 'signed_up_to', 'cities', 'niches', 'industries',
                            'has_project', 'platforms', 'app_version_below', 'has_push_device', 'user_ids'];
  v_role  TEXT := coalesce(v_seg->>'role', 'both');
BEGIN
  IF jsonb_typeof(v_seg) <> 'object' THEN
    RAISE EXCEPTION 'segment must be an object';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(v_seg) LOOP
    IF NOT v_key = ANY (v_allowed) THEN
      RAISE EXCEPTION 'unknown segment key: %', v_key;
    END IF;
  END LOOP;
  IF v_role NOT IN ('influencer', 'business_owner', 'both') THEN
    RAISE EXCEPTION 'invalid role: %', v_role;
  END IF;
  IF v_seg ? 'user_ids' AND jsonb_array_length(v_seg->'user_ids') > 5000 THEN
    RAISE EXCEPTION 'user_ids is limited to 5000';
  END IF;

  RETURN QUERY
  SELECT p.id
  FROM public.profiles p
  LEFT JOIN public.influencer_profiles ip ON ip.user_id = p.id
  LEFT JOIN public.business_profiles  bp ON bp.user_id = p.id
  WHERE p.role::TEXT IN ('influencer', 'business_owner')          -- never admins
    AND (v_role = 'both' OR p.role::TEXT = v_role)
    AND (NOT v_seg ? 'creator_verification'
         OR (p.role = 'influencer' AND coalesce(p.verification_status, 'unverified')
               IN (SELECT jsonb_array_elements_text(v_seg->'creator_verification'))))
    AND (NOT v_seg ? 'business_approval'
         OR (p.role = 'business_owner' AND coalesce(bp.approval_status, 'pending_review')
               IN (SELECT jsonb_array_elements_text(v_seg->'business_approval'))))
    AND (NOT v_seg ? 'tier'
         OR public.current_tier(p.id)::TEXT IN (SELECT jsonb_array_elements_text(v_seg->'tier')))
    AND (NOT v_seg ? 'pro_expiring_within_days'
         OR EXISTS (SELECT 1 FROM public.subscriptions s
                    WHERE s.user_id = p.id AND s.tier = 'pro'
                      AND s.status IN ('active', 'authenticated')
                      AND s.current_period_end BETWEEN now() AND now() + make_interval(days => (v_seg->>'pro_expiring_within_days')::INT)))
    AND (NOT v_seg ? 'active_within_days'
         OR p.last_active_at > now() - make_interval(days => (v_seg->>'active_within_days')::INT))
    AND (NOT v_seg ? 'dormant_for_days'
         OR p.last_active_at IS NULL
         OR p.last_active_at < now() - make_interval(days => (v_seg->>'dormant_for_days')::INT))
    AND (NOT v_seg ? 'signed_up_from' OR p.created_at >= ((v_seg->>'signed_up_from')::DATE::timestamp AT TIME ZONE 'Asia/Kolkata'))
    AND (NOT v_seg ? 'signed_up_to'   OR p.created_at <  (((v_seg->>'signed_up_to')::DATE + 1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
    AND (NOT v_seg ? 'cities'
         OR lower(coalesce(ip.city, bp.city, p.location, '')) IN (SELECT lower(jsonb_array_elements_text(v_seg->'cities'))))
    AND (NOT v_seg ? 'niches'
         OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(ip.niche) = 'array' THEN ip.niche ELSE '[]'::jsonb END) n
                    WHERE lower(n) IN (SELECT lower(jsonb_array_elements_text(v_seg->'niches')))))
    AND (NOT v_seg ? 'industries'
         OR lower(coalesce(bp.industry, '')) IN (SELECT lower(jsonb_array_elements_text(v_seg->'industries'))))
    AND (NOT v_seg ? 'has_project'
         OR (v_seg->>'has_project')::BOOLEAN = EXISTS (
              SELECT 1 FROM public.campaign_projects cp
              WHERE cp.owner_user_id = p.id OR cp.counterparty_user_id = p.id))
    AND (NOT v_seg ? 'platforms'
         OR EXISTS (SELECT 1 FROM public.push_devices d
                    WHERE d.user_id = p.id AND d.disabled_at IS NULL
                      AND d.platform IN (SELECT jsonb_array_elements_text(v_seg->'platforms'))))
    AND (NOT v_seg ? 'app_version_below'
         OR EXISTS (SELECT 1 FROM public.push_devices d
                    WHERE d.user_id = p.id AND d.disabled_at IS NULL AND d.app_version IS NOT NULL
                      AND string_to_array(regexp_replace(d.app_version, '[^0-9.]', '', 'g'), '.')::INT[]
                          < string_to_array(regexp_replace(v_seg->>'app_version_below', '[^0-9.]', '', 'g'), '.')::INT[]))
    AND (NOT v_seg ? 'has_push_device'
         OR (v_seg->>'has_push_device')::BOOLEAN = EXISTS (
              SELECT 1 FROM public.push_devices d
              WHERE d.user_id = p.id AND d.disabled_at IS NULL AND d.permission = 'granted'))
    AND (NOT v_seg ? 'user_ids'
         OR p.id::TEXT IN (SELECT jsonb_array_elements_text(v_seg->'user_ids')));
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_audience_ids(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_audience_ids(JSONB) TO service_role;

-- Preview for the composer: live counts + a small sample.
CREATE OR REPLACE FUNCTION public.admin_preview_audience(p_segment JSONB, p_kind TEXT DEFAULT 'announcement')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat    TEXT := public.broadcast_category(p_kind);
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH a AS (SELECT user_id FROM public.broadcast_audience_ids(p_segment))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'creators', (SELECT count(*) FROM a JOIN public.profiles p ON p.id = a.user_id WHERE p.role = 'influencer'),
    'businesses', (SELECT count(*) FROM a JOIN public.profiles p ON p.id = a.user_id WHERE p.role = 'business_owner'),
    'with_push_device', (SELECT count(DISTINCT d.user_id) FROM a JOIN public.push_devices d
                          ON d.user_id = a.user_id AND d.disabled_at IS NULL AND d.permission = 'granted'),
    'push_devices', (SELECT count(*) FROM a JOIN public.push_devices d
                      ON d.user_id = a.user_id AND d.disabled_at IS NULL AND d.permission = 'granted'),
    'push_opted_out', (SELECT count(*) FROM a JOIN public.notification_preferences np
                        ON np.user_id = a.user_id AND np.category = v_cat AND NOT np.push),
    'email_opted_out', (SELECT count(*) FROM a JOIN public.notification_preferences np
                         ON np.user_id = a.user_id AND np.category = v_cat AND NOT np.email),
    'sample', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role))
                        FROM (SELECT user_id FROM a LIMIT 8) s JOIN public.profiles p ON p.id = s.user_id), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preview_audience(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_audience(JSONB, TEXT) TO authenticated;

-- ── 4. Enqueue a run ───────────────────────────────────────────────────────
-- p_test_user: a test send to ONE user (the admin), bypassing audience, caps
-- and quiet hours; still one delivery row per channel/device so it is logged.
CREATE OR REPLACE FUNCTION public.enqueue_broadcast_run(
  p_broadcast_id  UUID,
  p_scheduled_for TIMESTAMPTZ DEFAULT now(),
  p_test_user     UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b          public.broadcasts%ROWTYPE;
  v_run      UUID;
  v_cat      TEXT;
  v_quiet    BOOLEAN;
  v_resume   TIMESTAMPTZ;
  v_ist_hour INT := extract(hour FROM now() AT TIME ZONE 'Asia/Kolkata')::INT;
  v_capped   BOOLEAN;
  v_targeted INT;
BEGIN
  SELECT * INTO b FROM public.broadcasts WHERE id = p_broadcast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'broadcast not found';
  END IF;

  v_cat := public.broadcast_category(b.kind);
  v_capped := b.kind IN ('announcement', 'promo', 'tutorial') AND p_test_user IS NULL;

  -- Quiet hours 21:00–09:00 IST for non-service kinds.
  v_quiet := p_test_user IS NULL AND b.respect_quiet_hours
             AND b.kind IN ('announcement', 'promo', 'tutorial')
             AND (v_ist_hour >= 21 OR v_ist_hour < 9);
  v_resume := CASE WHEN v_ist_hour >= 21
                   THEN ((now() AT TIME ZONE 'Asia/Kolkata')::DATE + 1 + TIME '09:00') AT TIME ZONE 'Asia/Kolkata'
                   ELSE ((now() AT TIME ZONE 'Asia/Kolkata')::DATE + TIME '09:00') AT TIME ZONE 'Asia/Kolkata' END;

  INSERT INTO public.broadcast_runs (broadcast_id, scheduled_for, is_test)
  VALUES (p_broadcast_id, p_scheduled_for, p_test_user IS NOT NULL)
  ON CONFLICT (broadcast_id, scheduled_for) WHERE NOT is_test DO NOTHING
  RETURNING id INTO v_run;

  IF v_run IS NULL THEN
    RETURN jsonb_build_object('created', FALSE, 'reason', 'run_exists');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _bc_audience (user_id UUID PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _bc_audience;
  IF p_test_user IS NOT NULL THEN
    INSERT INTO _bc_audience VALUES (p_test_user);
  ELSE
    INSERT INTO _bc_audience SELECT DISTINCT user_id FROM public.broadcast_audience_ids(b.audience);
  END IF;
  SELECT count(*) INTO v_targeted FROM _bc_audience;

  -- PUSH: one row per active, permitted device; a user with none is logged as skipped.
  IF 'push' = ANY (b.channels) THEN
    INSERT INTO public.broadcast_deliveries (run_id, broadcast_id, user_id, channel, device_id, expo_token,
                                             status, skip_reason, not_before)
    SELECT v_run, b.id, a.user_id, 'push', d.id, d.expo_token,
           CASE
             WHEN d.id IS NULL THEN 'skipped'
             WHEN v_cat IS NOT NULL AND p_test_user IS NULL AND np.push = FALSE THEN 'skipped'
             WHEN v_capped AND (
               (SELECT count(*) FROM public.broadcast_deliveries x JOIN public.broadcasts xb ON xb.id = x.broadcast_id
                 WHERE x.user_id = a.user_id AND x.channel = 'push' AND x.status IN ('sent', 'delivered')
                   AND xb.kind IN ('announcement', 'promo', 'tutorial') AND x.sent_at > now() - INTERVAL '24 hours') >= 1
               OR
               (SELECT count(*) FROM public.broadcast_deliveries x JOIN public.broadcasts xb ON xb.id = x.broadcast_id
                 WHERE x.user_id = a.user_id AND x.channel = 'push' AND x.status IN ('sent', 'delivered')
                   AND xb.kind IN ('announcement', 'promo', 'tutorial') AND x.sent_at > now() - INTERVAL '7 days') >= 3
             ) THEN 'skipped'
             WHEN v_quiet THEN 'deferred'
             ELSE 'queued'
           END,
           CASE
             WHEN d.id IS NULL THEN 'no_device'
             WHEN v_cat IS NOT NULL AND p_test_user IS NULL AND np.push = FALSE THEN 'opted_out'
             WHEN v_capped AND (
               (SELECT count(*) FROM public.broadcast_deliveries x JOIN public.broadcasts xb ON xb.id = x.broadcast_id
                 WHERE x.user_id = a.user_id AND x.channel = 'push' AND x.status IN ('sent', 'delivered')
                   AND xb.kind IN ('announcement', 'promo', 'tutorial') AND x.sent_at > now() - INTERVAL '24 hours') >= 1
               OR
               (SELECT count(*) FROM public.broadcast_deliveries x JOIN public.broadcasts xb ON xb.id = x.broadcast_id
                 WHERE x.user_id = a.user_id AND x.channel = 'push' AND x.status IN ('sent', 'delivered')
                   AND xb.kind IN ('announcement', 'promo', 'tutorial') AND x.sent_at > now() - INTERVAL '7 days') >= 3
             ) THEN 'frequency_cap'
           END,
           CASE WHEN v_quiet THEN v_resume END
    FROM _bc_audience a
    LEFT JOIN public.push_devices d
      ON d.user_id = a.user_id AND d.disabled_at IS NULL AND d.permission = 'granted'
    LEFT JOIN public.notification_preferences np
      ON np.user_id = a.user_id AND np.category = v_cat
    ON CONFLICT DO NOTHING;
  END IF;

  -- IN-APP: always allowed (it is inside the product), never quiet-houred.
  IF 'in_app' = ANY (b.channels) THEN
    INSERT INTO public.broadcast_deliveries (run_id, broadcast_id, user_id, channel, status)
    SELECT v_run, b.id, a.user_id, 'in_app', 'queued' FROM _bc_audience a
    ON CONFLICT DO NOTHING;
  END IF;

  -- EMAIL: marketing opt-outs are also re-checked by lib/email/policy at send.
  IF 'email' = ANY (b.channels) THEN
    INSERT INTO public.broadcast_deliveries (run_id, broadcast_id, user_id, channel, status, skip_reason)
    SELECT v_run, b.id, a.user_id, 'email',
           CASE WHEN v_cat IS NOT NULL AND p_test_user IS NULL AND np.email = FALSE THEN 'skipped' ELSE 'queued' END,
           CASE WHEN v_cat IS NOT NULL AND p_test_user IS NULL AND np.email = FALSE THEN 'opted_out' END
    FROM _bc_audience a
    LEFT JOIN public.notification_preferences np ON np.user_id = a.user_id AND np.category = v_cat
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.broadcast_runs SET targeted = v_targeted WHERE id = v_run;
  IF p_test_user IS NULL THEN
    UPDATE public.broadcasts
       SET status = CASE WHEN frequency = 'once' THEN 'sending' ELSE status END,
           last_run_at = now()
     WHERE id = b.id;
  END IF;

  RETURN jsonb_build_object('created', TRUE, 'run_id', v_run, 'targeted', v_targeted,
                            'deliveries', (SELECT count(*) FROM public.broadcast_deliveries WHERE run_id = v_run));
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_broadcast_run(UUID, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_broadcast_run(UUID, TIMESTAMPTZ, UUID) TO service_role;

-- ── 5. Which broadcasts are due ────────────────────────────────────────────
-- Returns each (broadcast, slot) that should run now and has no run yet.
-- Recurring slots are computed in IST; a slot older than 6 hours is skipped
-- rather than sent late (a missed 9am tip should not arrive at 11pm).
CREATE OR REPLACE FUNCTION public.due_broadcasts()
RETURNS TABLE (broadcast_id UUID, scheduled_for TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH now_ist AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata') AS t),
  slots AS (
    SELECT b.id,
           CASE
             WHEN b.frequency = 'once' THEN b.send_at
             ELSE ((SELECT t FROM now_ist)::DATE + b.time_ist) AT TIME ZONE 'Asia/Kolkata'
           END AS slot,
           b.frequency, b.by_weekday, b.by_monthday, b.starts_on, b.ends_on
    FROM public.broadcasts b
    WHERE b.status = 'scheduled'
  )
  SELECT s.id, s.slot
  FROM slots s, now_ist n
  WHERE s.slot IS NOT NULL
    AND s.slot <= now()
    AND (s.frequency = 'once' OR s.slot > now() - INTERVAL '6 hours')
    AND (s.starts_on IS NULL OR n.t::DATE >= s.starts_on)
    AND (s.ends_on IS NULL OR n.t::DATE <= s.ends_on)
    AND (s.frequency IN ('once', 'daily')
         OR (s.frequency = 'weekly' AND extract(isodow FROM n.t)::SMALLINT = ANY (s.by_weekday))
         OR (s.frequency = 'monthly' AND extract(day FROM n.t)::SMALLINT = s.by_monthday))
    AND NOT EXISTS (SELECT 1 FROM public.broadcast_runs r
                    WHERE r.broadcast_id = s.id AND r.scheduled_for = s.slot AND NOT r.is_test);
$$;

REVOKE ALL ON FUNCTION public.due_broadcasts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_broadcasts() TO service_role;

-- ── 6. Claim deliveries for the sender ─────────────────────────────────────
-- SKIP LOCKED: two overlapping cron invocations can never take the same row.
-- A row stuck in `sending` for 10 minutes (crashed worker) is reclaimed.
CREATE OR REPLACE FUNCTION public.claim_broadcast_deliveries(p_channel TEXT, p_limit INT DEFAULT 500)
RETURNS TABLE (
  id BIGINT, run_id UUID, broadcast_id UUID, user_id UUID, device_id UUID, expo_token TEXT,
  kind TEXT, title TEXT, body TEXT, image_url TEXT, deep_link TEXT, cta_label TEXT, guide_id TEXT,
  in_app_style TEXT, attempts INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH picked AS (
    SELECT d.id
    FROM public.broadcast_deliveries d
    JOIN public.broadcasts b ON b.id = d.broadcast_id
    WHERE d.channel = p_channel
      AND b.status NOT IN ('paused', 'cancelled')
      AND (
        d.status = 'queued'
        OR (d.status = 'deferred' AND d.not_before <= now())
        OR (d.status = 'sending' AND d.claimed_at < now() - INTERVAL '10 minutes' AND d.attempts < 5)
      )
    ORDER BY d.id
    LIMIT least(greatest(coalesce(p_limit, 500), 1), 2000)
    FOR UPDATE OF d SKIP LOCKED
  ),
  upd AS (
    UPDATE public.broadcast_deliveries d
       SET status = 'sending', attempts = d.attempts + 1, claimed_at = now()
      FROM picked
     WHERE d.id = picked.id
    RETURNING d.*
  )
  SELECT u.id, u.run_id, u.broadcast_id, u.user_id, u.device_id, u.expo_token,
         b.kind, b.title, b.body, b.image_url, b.deep_link, b.cta_label, b.guide_id, b.in_app_style, u.attempts
  FROM upd u JOIN public.broadcasts b ON b.id = u.broadcast_id
  ORDER BY u.id;
$$;

REVOKE ALL ON FUNCTION public.claim_broadcast_deliveries(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_broadcast_deliveries(TEXT, INT) TO service_role;

-- ── 7. Finalise runs ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_broadcast_runs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INT;
BEGIN
  UPDATE public.broadcast_runs r
     SET stats = x.stats,
         finished_at = CASE WHEN x.open_rows = 0 THEN COALESCE(r.finished_at, now()) ELSE NULL END
    FROM (
      SELECT d.run_id,
             count(*) FILTER (WHERE d.status IN ('queued', 'deferred', 'sending')) AS open_rows,
             jsonb_build_object(
               'total',     count(*),
               'queued',    count(*) FILTER (WHERE d.status IN ('queued', 'sending')),
               'deferred',  count(*) FILTER (WHERE d.status = 'deferred'),
               'skipped',   count(*) FILTER (WHERE d.status = 'skipped'),
               'sent',      count(*) FILTER (WHERE d.status IN ('sent', 'delivered')),
               'delivered', count(*) FILTER (WHERE d.status = 'delivered'),
               'errors',    count(*) FILTER (WHERE d.status = 'error'),
               'opened',    count(*) FILTER (WHERE d.opened_at IS NOT NULL),
               'push_sent', count(*) FILTER (WHERE d.channel = 'push' AND d.status IN ('sent', 'delivered')),
               'in_app',    count(*) FILTER (WHERE d.channel = 'in_app' AND d.status IN ('sent', 'delivered')),
               'email_sent',count(*) FILTER (WHERE d.channel = 'email' AND d.status IN ('sent', 'delivered'))
             ) AS stats
      FROM public.broadcast_deliveries d
      WHERE d.run_id IN (SELECT id FROM public.broadcast_runs
                         WHERE finished_at IS NULL OR finished_at > now() - INTERVAL '2 days')
      GROUP BY d.run_id
    ) x
   WHERE r.id = x.run_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- One-off broadcasts whose only real run has finished.
  UPDATE public.broadcasts b SET status = 'sent'
   WHERE b.status = 'sending' AND b.frequency = 'once'
     AND EXISTS (SELECT 1 FROM public.broadcast_runs r WHERE r.broadcast_id = b.id AND NOT r.is_test)
     AND NOT EXISTS (SELECT 1 FROM public.broadcast_runs r
                     WHERE r.broadcast_id = b.id AND NOT r.is_test AND r.finished_at IS NULL);

  -- Recurring broadcasts past their end date.
  UPDATE public.broadcasts b SET status = 'sent'
   WHERE b.status = 'scheduled' AND b.frequency <> 'once' AND b.ends_on IS NOT NULL
     AND b.ends_on < (now() AT TIME ZONE 'Asia/Kolkata')::DATE;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_broadcast_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_broadcast_runs() TO service_role;

-- ── 8. Admin reads ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcasts(
  p_status TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM public.broadcasts WHERE p_status IS NULL OR status = p_status),
    'summary', jsonb_build_object(
      'scheduled', (SELECT count(*) FROM public.broadcasts WHERE status = 'scheduled'),
      'recurring', (SELECT count(*) FROM public.broadcasts WHERE status = 'scheduled' AND frequency <> 'once'),
      'sent_30d',  (SELECT count(*) FROM public.broadcast_runs WHERE NOT is_test AND started_at > now() - INTERVAL '30 days'),
      'push_sent_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.channel = 'push' AND d.status IN ('sent', 'delivered')
                          AND d.sent_at > now() - INTERVAL '30 days'),
      'push_delivered_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.channel = 'push' AND d.status = 'delivered'
                          AND d.sent_at > now() - INTERVAL '30 days'),
      'opened_30d', (SELECT count(*) FROM public.broadcast_deliveries d JOIN public.broadcast_runs r ON r.id = d.run_id
                        WHERE NOT r.is_test AND d.opened_at > now() - INTERVAL '30 days')
    ),
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'kind', b.kind, 'title', b.title, 'body', b.body,
        'channels', b.channels, 'in_app_style', b.in_app_style, 'status', b.status,
        'frequency', b.frequency, 'send_at', b.send_at, 'time_ist', b.time_ist,
        'by_weekday', b.by_weekday, 'by_monthday', b.by_monthday,
        'audience', b.audience, 'system_owned', b.system_owned,
        'created_at', b.created_at, 'last_run_at', b.last_run_at,
        'created_by_name', cb.name,
        'runs', (SELECT count(*) FROM public.broadcast_runs r WHERE r.broadcast_id = b.id AND NOT r.is_test),
        'stats', (SELECT jsonb_build_object(
                    'targeted', coalesce(sum(r.targeted), 0),
                    'sent', coalesce(sum((r.stats->>'sent')::INT), 0),
                    'delivered', coalesce(sum((r.stats->>'delivered')::INT), 0),
                    'errors', coalesce(sum((r.stats->>'errors')::INT), 0),
                    'skipped', coalesce(sum((r.stats->>'skipped')::INT), 0),
                    'opened', coalesce(sum((r.stats->>'opened')::INT), 0))
                  FROM public.broadcast_runs r WHERE r.broadcast_id = b.id AND NOT r.is_test)
      ) ORDER BY b.created_at DESC)
      FROM (SELECT * FROM public.broadcasts
            WHERE p_status IS NULL OR status = p_status
            ORDER BY created_at DESC
            LIMIT least(greatest(coalesce(p_limit, 50), 1), 200) OFFSET greatest(coalesce(p_offset, 0), 0)) b
      LEFT JOIN public.profiles cb ON cb.id = b.created_by
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcasts(TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcasts(TEXT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_broadcast_detail(
  p_id     UUID,
  p_status TEXT DEFAULT NULL,
  p_limit  INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'broadcast', (SELECT to_jsonb(b) || jsonb_build_object('created_by_name', p.name, 'approved_by_name', ap.name)
                  FROM public.broadcasts b
                  LEFT JOIN public.profiles p ON p.id = b.created_by
                  LEFT JOIN public.profiles ap ON ap.id = b.approved_by
                  WHERE b.id = p_id),
    'runs', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC)
                      FROM public.broadcast_runs r WHERE r.broadcast_id = p_id), '[]'::jsonb),
    'by_channel', COALESCE((SELECT jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'count', c))
                            FROM (SELECT d.channel, d.status, count(*) c FROM public.broadcast_deliveries d
                                  WHERE d.broadcast_id = p_id GROUP BY 1, 2) x), '[]'::jsonb),
    'skip_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                              FROM (SELECT coalesce(skip_reason, error_code) r, count(*) c FROM public.broadcast_deliveries
                                    WHERE broadcast_id = p_id AND status IN ('skipped', 'error') GROUP BY 1) x), '[]'::jsonb),
    'announcement', (SELECT jsonb_build_object(
                        'seen', count(*) FILTER (WHERE seen_at IS NOT NULL),
                        'dismissed', count(*) FILTER (WHERE dismissed_at IS NOT NULL),
                        'clicked', count(*) FILTER (WHERE clicked_at IS NOT NULL))
                     FROM public.announcement_views WHERE broadcast_id = p_id),
    'total_deliveries', (SELECT count(*) FROM public.broadcast_deliveries
                         WHERE broadcast_id = p_id AND (p_status IS NULL OR status = p_status)),
    'deliveries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'run_id', d.run_id, 'user_id', d.user_id, 'user_name', p.name, 'user_role', p.role,
        'channel', d.channel, 'status', d.status, 'skip_reason', d.skip_reason,
        'platform', pd.platform, 'error_code', d.error_code, 'error_message', d.error_message,
        'sent_at', d.sent_at, 'delivered_at', d.delivered_at, 'opened_at', d.opened_at, 'created_at', d.created_at
      ) ORDER BY d.id DESC)
      FROM (SELECT * FROM public.broadcast_deliveries
            WHERE broadcast_id = p_id AND (p_status IS NULL OR status = p_status)
            ORDER BY id DESC
            LIMIT least(greatest(coalesce(p_limit, 100), 1), 1000) OFFSET greatest(coalesce(p_offset, 0), 0)) d
      LEFT JOIN public.profiles p ON p.id = d.user_id
      LEFT JOIN public.push_devices pd ON pd.id = d.device_id
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_detail(UUID, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_detail(UUID, TEXT, INT, INT) TO authenticated;

-- ── 9. User-facing: announcements, opens, preferences ──────────────────────
CREATE OR REPLACE FUNCTION public.get_my_announcements()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'sent_at' DESC), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (b.id) jsonb_build_object(
             'broadcast_id', b.id, 'delivery_id', d.id, 'kind', b.kind, 'style', b.in_app_style,
             'title', b.title, 'body', b.body, 'image_url', b.image_url, 'deep_link', b.deep_link,
             'cta_label', b.cta_label, 'guide_id', b.guide_id, 'sent_at', d.sent_at) AS x
    FROM public.broadcast_deliveries d
    JOIN public.broadcasts b ON b.id = d.broadcast_id
    LEFT JOIN public.announcement_views v ON v.user_id = d.user_id AND v.broadcast_id = b.id
    WHERE d.user_id = auth.uid()
      AND d.channel = 'in_app'
      AND d.status IN ('sent', 'delivered')
      AND b.in_app_style IN ('banner', 'modal')
      AND b.status NOT IN ('cancelled')
      AND d.sent_at > now() - INTERVAL '14 days'
      AND v.dismissed_at IS NULL
    ORDER BY b.id, d.sent_at DESC
    LIMIT 5
  ) s;
$$;

REVOKE ALL ON FUNCTION public.get_my_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_announcements() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_announcement(p_broadcast_id UUID, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_action NOT IN ('seen', 'dismissed', 'clicked') THEN
    RETURN;
  END IF;
  -- Only for a broadcast actually delivered to the caller.
  IF NOT EXISTS (SELECT 1 FROM public.broadcast_deliveries
                 WHERE user_id = auth.uid() AND broadcast_id = p_broadcast_id AND channel = 'in_app') THEN
    RETURN;
  END IF;
  INSERT INTO public.announcement_views AS v (user_id, broadcast_id, seen_at, dismissed_at, clicked_at)
  VALUES (auth.uid(), p_broadcast_id,
          now(),
          CASE WHEN p_action IN ('dismissed', 'clicked') THEN now() END,
          CASE WHEN p_action = 'clicked' THEN now() END)
  ON CONFLICT (user_id, broadcast_id) DO UPDATE SET
    seen_at      = COALESCE(v.seen_at, now()),
    dismissed_at = COALESCE(v.dismissed_at, EXCLUDED.dismissed_at),
    clicked_at   = COALESCE(v.clicked_at, EXCLUDED.clicked_at);

  IF p_action = 'clicked' THEN
    UPDATE public.broadcast_deliveries SET opened_at = COALESCE(opened_at, now())
     WHERE user_id = auth.uid() AND broadcast_id = p_broadcast_id AND channel = 'in_app';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_announcement(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_announcement(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_delivery_opened(p_delivery_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.broadcast_deliveries
     SET opened_at = COALESCE(opened_at, now()),
         status = CASE WHEN status = 'sent' THEN 'delivered' ELSE status END,
         delivered_at = COALESCE(delivered_at, CASE WHEN status IN ('sent', 'delivered') THEN now() END)
   WHERE id = p_delivery_id AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.mark_delivery_opened(BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_delivery_opened(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_object_agg(c.category, jsonb_build_object(
           'push', COALESCE(np.push, TRUE), 'email', COALESCE(np.email, TRUE)))
  FROM (VALUES ('announcements'), ('promotions'), ('tips')) AS c(category)
  LEFT JOIN public.notification_preferences np ON np.user_id = auth.uid() AND np.category = c.category;
$$;

CREATE OR REPLACE FUNCTION public.set_my_notification_preference(p_category TEXT, p_push BOOLEAN, p_email BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_category NOT IN ('announcements', 'promotions', 'tips') THEN
    RAISE EXCEPTION 'invalid preference';
  END IF;
  INSERT INTO public.notification_preferences (user_id, category, push, email)
  VALUES (auth.uid(), p_category, COALESCE(p_push, TRUE), COALESCE(p_email, TRUE))
  ON CONFLICT (user_id, category) DO UPDATE
    SET push = COALESCE(p_push, notification_preferences.push),
        email = COALESCE(p_email, notification_preferences.email),
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_notification_preferences() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_notification_preference(TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_notification_preference(TEXT, BOOLEAN, BOOLEAN) TO authenticated;
