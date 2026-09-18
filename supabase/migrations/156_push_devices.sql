-- Migration 156: multi-device push registration
--
-- WHY: profiles.expo_push_token (079) holds ONE token per account, so signing in
-- on a second device silently took over every push, and nothing recorded the
-- platform, app version or permission state the admin needs for "split by
-- platform", "update your app" broadcasts and push opt-in analytics.
--
-- push_devices is one row per installed app instance. profiles.expo_push_token
-- is kept in step (the most recently registered device) so any code or old
-- deployment still reading it keeps working; nothing new should read it.

CREATE TABLE IF NOT EXISTS public.push_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expo_token      TEXT NOT NULL UNIQUE,
  platform        TEXT NOT NULL DEFAULT 'unknown' CHECK (platform IN ('ios', 'android', 'unknown')),
  app_version     TEXT,
  os_version      TEXT,
  permission      TEXT NOT NULL DEFAULT 'granted' CHECK (permission IN ('granted', 'denied', 'undetermined')),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at     TIMESTAMPTZ,
  disabled_reason TEXT,          -- DeviceNotRegistered | signed_out | permission_denied | replaced
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_user_active_idx ON public.push_devices (user_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS push_devices_platform_idx ON public.push_devices (platform, app_version) WHERE disabled_at IS NULL;

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
-- A user must never read anyone's token, including their own via a join.
REVOKE ALL ON public.push_devices FROM anon, authenticated;

-- Backfill the single tokens we already hold.
INSERT INTO public.push_devices (user_id, expo_token, last_seen_at)
SELECT id, expo_push_token, COALESCE(last_active_at, updated_at, now())
FROM public.profiles
WHERE expo_push_token IS NOT NULL AND expo_push_token <> ''
ON CONFLICT (expo_token) DO NOTHING;

-- ── register_push_device() — the caller registers THIS device ──────────────
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_token       TEXT,
  p_platform    TEXT DEFAULT 'unknown',
  p_app_version TEXT DEFAULT NULL,
  p_os_version  TEXT DEFAULT NULL,
  p_permission  TEXT DEFAULT 'granted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_token IS NULL OR length(p_token) < 10 OR length(p_token) > 200 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  -- UPSERT by token and REASSIGN the owner: a phone that signed out of one
  -- account and into another must stop receiving the first account's pushes.
  INSERT INTO public.push_devices AS d (user_id, expo_token, platform, app_version, os_version, permission)
  VALUES (v_uid, p_token,
          CASE WHEN p_platform IN ('ios', 'android') THEN p_platform ELSE 'unknown' END,
          left(p_app_version, 32), left(p_os_version, 32),
          CASE WHEN p_permission IN ('granted', 'denied', 'undetermined') THEN p_permission ELSE 'granted' END)
  ON CONFLICT (expo_token) DO UPDATE SET
    user_id         = EXCLUDED.user_id,
    platform        = CASE WHEN EXCLUDED.platform <> 'unknown' THEN EXCLUDED.platform ELSE d.platform END,
    app_version     = COALESCE(EXCLUDED.app_version, d.app_version),
    os_version      = COALESCE(EXCLUDED.os_version, d.os_version),
    permission      = EXCLUDED.permission,
    last_seen_at    = now(),
    disabled_at     = NULL,
    disabled_reason = NULL
  RETURNING id INTO v_id;

  -- Compatibility mirror (079). Only for this account; the previous owner of a
  -- reassigned token loses the mirror too.
  UPDATE public.profiles SET expo_push_token = NULL
   WHERE expo_push_token = p_token AND id <> v_uid;
  UPDATE public.profiles SET expo_push_token = p_token WHERE id = v_uid;

  RETURN jsonb_build_object('ok', TRUE, 'device_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── unregister_push_device() — sign-out ────────────────────────────────────
-- With a token: disable just that device. Without one (older app builds send
-- only `null`): disable all of the caller's devices, which is what clearing the
-- single column used to mean.
CREATE OR REPLACE FUNCTION public.unregister_push_device(p_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_n   INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.push_devices
     SET disabled_at = now(), disabled_reason = 'signed_out'
   WHERE user_id = v_uid AND disabled_at IS NULL
     AND (p_token IS NULL OR expo_token = p_token);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.profiles
     SET expo_push_token = (SELECT expo_token FROM public.push_devices
                             WHERE user_id = v_uid AND disabled_at IS NULL
                             ORDER BY last_seen_at DESC LIMIT 1)
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', TRUE, 'disabled', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.unregister_push_device(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(TEXT) TO authenticated;

-- ── admin_push_device_stats() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_push_device_stats()
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
    'active_devices',   (SELECT count(*) FROM public.push_devices WHERE disabled_at IS NULL),
    'disabled_devices', (SELECT count(*) FROM public.push_devices WHERE disabled_at IS NOT NULL),
    'users_reachable',  (SELECT count(DISTINCT user_id) FROM public.push_devices WHERE disabled_at IS NULL AND permission = 'granted'),
    'creators_reachable', (SELECT count(DISTINCT d.user_id) FROM public.push_devices d JOIN public.profiles p ON p.id = d.user_id
                            WHERE d.disabled_at IS NULL AND d.permission = 'granted' AND p.role = 'influencer'),
    'businesses_reachable', (SELECT count(DISTINCT d.user_id) FROM public.push_devices d JOIN public.profiles p ON p.id = d.user_id
                            WHERE d.disabled_at IS NULL AND d.permission = 'granted' AND p.role = 'business_owner'),
    'total_users', (SELECT count(*) FROM public.profiles WHERE role IN ('influencer', 'business_owner')),
    'by_platform', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'count', c) ORDER BY c DESC)
                     FROM (SELECT platform, count(*) c FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1) x), '[]'::jsonb),
    'by_version', COALESCE((SELECT jsonb_agg(jsonb_build_object('platform', platform, 'version', v, 'count', c) ORDER BY c DESC)
                    FROM (SELECT platform, coalesce(app_version, 'unknown') v, count(*) c
                          FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1, 2) x), '[]'::jsonb),
    'by_permission', COALESCE((SELECT jsonb_agg(jsonb_build_object('permission', permission, 'count', c))
                       FROM (SELECT permission, count(*) c FROM public.push_devices WHERE disabled_at IS NULL GROUP BY 1) x), '[]'::jsonb),
    'disabled_reasons', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r, 'count', c) ORDER BY c DESC)
                          FROM (SELECT coalesce(disabled_reason, 'unknown') r, count(*) c
                                FROM public.push_devices WHERE disabled_at IS NOT NULL GROUP BY 1) x), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_push_device_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_push_device_stats() TO authenticated;
