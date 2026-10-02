-- 194: "Someone viewed your profile" in the notification center.
--
-- record_profile_view (075) already logs one profile_views row per
-- (creator, viewer, day) for every signed-in visitor — brand or creator. This
-- adds the notification the creator never got.
--
-- What the notification says, and what it deliberately does not:
--   * It NEVER names the viewer. Names live on the "Who viewed your profile"
--     screen, behind the plan's read gate (GET /api/profile/viewers shows the
--     first billing_settings.free_profile_viewers identified on Free). A
--     notification that named everyone would give the gated list away free.
--   * It describes them the way LinkedIn does: "A brand in Food & Beverage from
--     Bengaluru", "A Fashion creator from Chennai" — from the viewer's own
--     public profile (industry / first niche, city), never from their IP.
--
-- Not a flood: one notification per creator per day. The first new viewer of
-- the day inserts it; every later NEW viewer that day rewrites the same unread
-- row ("4 people viewed your profile today") and bumps it to the top. A repeat
-- visit from someone already counted today changes nothing (the profile_views
-- unique key already drops it).
--
-- In-app only: rows written here are not pushed (push is sent by the web's
-- notifyUser(), which this does not call). Profile views are a nice-to-know,
-- not something worth buzzing a phone for.

CREATE OR REPLACE FUNCTION public.profile_viewer_descriptor(p_viewer UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'business_owner' THEN
      'A brand'
      || COALESCE(' in ' || NULLIF(btrim(b.industry), ''), '')
      || COALESCE(' from ' || NULLIF(btrim(b.city), ''), '')
    WHEN p.role = 'influencer' THEN
      'A '
      || COALESCE(NULLIF(btrim(i.niche[1]), '') || ' ', '')
      || 'creator'
      || COALESCE(' from ' || NULLIF(btrim(i.city), ''), '')
    ELSE 'Someone'
  END
  FROM public.profiles p
  LEFT JOIN public.business_profiles b ON b.user_id = p.id
  LEFT JOIN public.influencer_profiles i ON i.user_id = p.id
  WHERE p.id = p_viewer;
$$;

-- Internal helper only: callable by the definer functions below, not by clients.
REVOKE ALL ON FUNCTION public.profile_viewer_descriptor(UUID) FROM PUBLIC, anon, authenticated;

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
  ON CONFLICT (influencer_user_id, viewer_user_id, viewed_on) DO NOTHING;
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

-- Recording a view must never fail the page that triggered it. The web callers
-- already swallow errors (`.then(() => {}, () => {})`); nothing to change there.
