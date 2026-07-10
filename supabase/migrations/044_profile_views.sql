CREATE OR REPLACE FUNCTION public.record_profile_view(p_influencer_user_id UUID, p_viewer_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profile_views
  INSERT INTO public.profile_views (influencer_user_id, viewer_user_id)
  VALUES (p_influencer_user_id, p_viewer_user_id);

  -- If viewer is a known business and not the creator themselves, also update creator_profile_views
  IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id <> p_influencer_user_id THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_viewer_user_id AND role = 'business_owner') THEN
      INSERT INTO public.creator_profile_views (creator_id, business_id, view_count, last_viewed_at)
      VALUES (p_influencer_user_id, p_viewer_user_id, 1, now())
      ON CONFLICT (creator_id, business_id) DO UPDATE
      SET view_count = public.creator_profile_views.view_count + 1,
          last_viewed_at = now();
    END IF;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_profile_view(UUID, UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_profile_link_click(p_influencer_user_id UUID, p_link_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_link_clicks (influencer_user_id, link_type)
  VALUES (p_influencer_user_id, p_link_type);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_profile_link_click(UUID, TEXT) TO anon, authenticated;
