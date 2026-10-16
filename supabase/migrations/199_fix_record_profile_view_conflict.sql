-- 199: record_profile_view has never recorded a view.
--
-- profile_views_daily_uidx (075) is a PARTIAL unique index:
--   (influencer_user_id, viewer_user_id, viewed_on) WHERE viewer_user_id IS NOT NULL
-- Postgres only infers a partial index as an ON CONFLICT arbiter when the
-- statement repeats its predicate. 075 and 194 wrote the conflict target
-- without it, so every call raised 42P10 ("no unique or exclusion constraint
-- matching the ON CONFLICT specification") and rolled back. Both web callers
-- discard the RPC result, so nobody saw it: staging had zero profile_views
-- rows, dev only seeded ones, and creators never got "who viewed you" or the
-- profile-view notification. Proven on dev 2026-10-15 by calling the RPC as an
-- audit persona.
--
-- The only change from 194 is the WHERE on the ON CONFLICT target.

CREATE OR REPLACE FUNCTION public.record_profile_view(
  p_influencer_user_id UUID,
  p_viewer_user_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_new_today INTEGER;
  v_descriptor TEXT;
  v_viewers_today INTEGER;
  v_notification UUID;
BEGIN
  -- The caller must be a real signed-in account, and may only record a view
  -- as themselves — never on behalf of an arbitrary p_viewer_user_id.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id <> v_caller THEN
    RAISE EXCEPTION 'viewer_mismatch';
  END IF;

  -- Never count the creator's own visits to their own profile.
  IF v_caller = p_influencer_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.profile_views (influencer_user_id, viewer_user_id)
  VALUES (p_influencer_user_id, v_caller)
  ON CONFLICT (influencer_user_id, viewer_user_id, viewed_on) WHERE viewer_user_id IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_new_today = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller AND role = 'business_owner') THEN
    INSERT INTO public.creator_profile_views (creator_id, business_id, view_count, last_viewed_at)
    VALUES (p_influencer_user_id, v_caller, 1, now())
    ON CONFLICT (creator_id, business_id) DO UPDATE
    SET view_count = public.creator_profile_views.view_count + 1,
        last_viewed_at = now();
  END IF;

  -- Notify only for a viewer not yet counted today, and only creators.
  IF v_new_today = 0 OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_influencer_user_id AND role = 'influencer'
  ) THEN
    RETURN;
  END IF;

  v_descriptor := COALESCE(public.profile_viewer_descriptor(v_caller), 'Someone');

  SELECT count(DISTINCT viewer_user_id) INTO v_viewers_today
  FROM public.profile_views
  WHERE influencer_user_id = p_influencer_user_id
    AND viewed_on = current_date
    AND viewer_user_id IS NOT NULL;

  SELECT id INTO v_notification
  FROM public.notifications
  WHERE user_id = p_influencer_user_id
    AND type = 'profile_view'
    AND read_at IS NULL
    AND created_at >= date_trunc('day', now())
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_notification IS NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      p_influencer_user_id,
      'profile_view',
      v_descriptor || ' viewed your profile',
      'See who''s been looking at your profile.',
      '/dashboard/profile-viewers'
    );
  ELSE
    UPDATE public.notifications
    SET title = v_viewers_today || ' people viewed your profile today',
        body = 'Latest: ' || lower(left(v_descriptor, 1)) || substr(v_descriptor, 2) || '.',
        created_at = now()
    WHERE id = v_notification;
  END IF;
END;
$$;
