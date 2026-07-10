-- Influnet: auth users + business_owner / influencer profiles
-- Run in Supabase Dashboard → SQL Editor (or: supabase db push)

-- ---------------------------------------------------------------------------
-- Role enum (matches React: role "business_owner" | "influencer")
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('business_owner', 'influencer', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Core profile (1 row per auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- ---------------------------------------------------------------------------
-- Business owner (signup: /signup/business)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  company_name TEXT,
  industry TEXT,
  gst_number TEXT,
  website TEXT,
  collab_preferences JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Influencer / creator (signup: /signup/influencer)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  bio TEXT,
  niche JSONB DEFAULT '[]'::jsonb,
  instagram_handle TEXT,
  youtube_handle TEXT,
  twitter_handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS business_profiles_updated_at ON public.business_profiles;
CREATE TRIGGER business_profiles_updated_at
  BEFORE UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS influencer_profiles_updated_at ON public.influencer_profiles;
CREATE TRIGGER influencer_profiles_updated_at
  BEFORE UPDATE ON public.influencer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: own row
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Businesses: discover can read influencer profiles (public directory)
DROP POLICY IF EXISTS "influencer_profiles_select_authenticated" ON public.influencer_profiles;
CREATE POLICY "influencer_profiles_select_authenticated"
  ON public.influencer_profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "influencer_profiles_select_public" ON public.profiles;
CREATE POLICY "influencer_profiles_select_public"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (role = 'influencer');

DROP POLICY IF EXISTS "influencer_profiles_insert_own" ON public.influencer_profiles;
CREATE POLICY "influencer_profiles_insert_own"
  ON public.influencer_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "influencer_profiles_update_own" ON public.influencer_profiles;
CREATE POLICY "influencer_profiles_update_own"
  ON public.influencer_profiles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_select_own" ON public.business_profiles;
CREATE POLICY "business_profiles_select_own"
  ON public.business_profiles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_insert_own" ON public.business_profiles;
CREATE POLICY "business_profiles_insert_own"
  ON public.business_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "business_profiles_update_own" ON public.business_profiles;
CREATE POLICY "business_profiles_update_own"
  ON public.business_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Signup helper: call from app after supabase.auth.signUp (see docs/SUPABASE.md)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_profile(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  r public.user_role;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  r := (payload->>'role')::public.user_role;

  INSERT INTO public.profiles (id, role, email, name, phone, location)
  VALUES (
    uid,
    r,
    COALESCE(payload->>'email', (SELECT email FROM auth.users WHERE id = uid)),
    payload->>'name',
    payload->>'phone',
    payload->>'location'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    location = EXCLUDED.location,
    updated_at = now();

  IF r = 'business_owner' THEN
    INSERT INTO public.business_profiles (
      user_id, company_name, industry, gst_number, website, collab_preferences
    ) VALUES (
      uid,
      payload->>'companyName',
      payload->>'industry',
      payload->>'gstNumber',
      payload->>'website',
      COALESCE(payload->'collabPreferences', '[]'::jsonb)
    )
    ON CONFLICT (user_id) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      industry = EXCLUDED.industry,
      gst_number = EXCLUDED.gst_number,
      website = EXCLUDED.website,
      collab_preferences = EXCLUDED.collab_preferences,
      updated_at = now();
  ELSIF r = 'influencer' THEN
    INSERT INTO public.influencer_profiles (
      user_id, bio, niche, instagram_handle, youtube_handle, twitter_handle
    ) VALUES (
      uid,
      payload->>'bio',
      COALESCE(payload->'niche', '[]'::jsonb),
      payload->>'instagramHandle',
      payload->>'youtubeHandle',
      payload->>'twitterHandle'
    )
    ON CONFLICT (user_id) DO UPDATE SET
      bio = EXCLUDED.bio,
      niche = EXCLUDED.niche,
      instagram_handle = EXCLUDED.instagram_handle,
      youtube_handle = EXCLUDED.youtube_handle,
      twitter_handle = EXCLUDED.twitter_handle,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'id', uid,
    'role', r,
    'email', payload->>'email'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_profile(JSONB) TO authenticated;
