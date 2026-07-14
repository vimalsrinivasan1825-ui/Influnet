-- Migration 060: Social snapshots — cached public analytics for creator profiles
--
-- The verification run already pays Apify for a full profile scrape (followers,
-- recent posts with thumbnails/likes/views). This table persists that payload so
-- the public profile (/c/[username]) can show REAL analytics instead of mock
-- data: posts count, avg views, engagement rate, and a recent-posts grid that
-- links to the actual Instagram posts.
--
-- Thumbnails: Instagram CDN URLs are signed and expire after days, so the
-- capture step downloads them into the public `social-cache` storage bucket and
-- stores only our own storage paths here.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  platform        text NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok')),
  handle          text NOT NULL,                       -- normalized (lowercase, no @)
  follower_count  bigint,
  posts_count     integer,
  avg_views       bigint,                              -- mean video view count of recent posts (null when unknown)
  engagement_rate numeric(5, 2),                       -- avg(likes+comments)/followers, percent
  is_verified     boolean NOT NULL DEFAULT false,      -- the PLATFORM's own verified flag (IG blue check)
  profile_pic_path text,                               -- storage path in `social-cache` (not a CDN URL)
  -- Array of recent posts:
  --   [{ url, shortcode, type, caption, likes, comments, views, taken_at,
  --      thumb_path, pinned }]
  -- `thumb_path` is a `social-cache` storage path; `url` is the permanent
  -- instagram.com post link.
  recent_posts    jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One snapshot per (user, platform); refreshes overwrite in place.
CREATE UNIQUE INDEX IF NOT EXISTS social_snapshots_user_platform_uidx
  ON public.social_snapshots (user_id, platform);

ALTER TABLE public.social_snapshots ENABLE ROW LEVEL SECURITY;

-- This is public-profile data by definition (it renders on /c/[username] for
-- anonymous visitors), so anyone may read. Writes happen ONLY via the service
-- role during snapshot capture (no INSERT/UPDATE policies on purpose).
DROP POLICY IF EXISTS social_snapshots_public_read ON public.social_snapshots;
CREATE POLICY social_snapshots_public_read ON public.social_snapshots
  FOR SELECT TO public
  USING (true);

GRANT SELECT ON public.social_snapshots TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Storage bucket for cached thumbnails/avatars (public read, server write)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-cache',
  'social-cache',
  true,
  2097152, -- 2 MB per image is plenty for thumbnails
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS social_cache_public_read ON storage.objects;
CREATE POLICY social_cache_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'social-cache');

-- No client INSERT/UPDATE/DELETE policies: only the service role (which
-- bypasses RLS) writes cached images during snapshot capture.
