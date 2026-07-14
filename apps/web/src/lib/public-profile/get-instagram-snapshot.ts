// Server-side fetch of a creator's captured Instagram snapshot (see
// lib/social-snapshot.ts for the capture side). Shared by the public profile
// page (/c/[username]) and the media kit (/c/[username]/media-kit).

import { createClient } from '@supabase/supabase-js';
import type { InstagramSnapshotView } from './creator-profile';

// Anon client — social_snapshots is public-read by design (it renders for
// anonymous visitors).
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const socialCacheUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/social-cache/${path}`;

export async function getInstagramSnapshot(userId: string): Promise<InstagramSnapshotView | null> {
  const { data, error } = await supabaseAnon
    .from('social_snapshots')
    .select('follower_count, posts_count, avg_views, engagement_rate, is_verified, profile_pic_path, recent_posts, fetched_at')
    .eq('user_id', userId)
    .eq('platform', 'instagram')
    .maybeSingle();
  if (error || !data) return null;

  const posts = (Array.isArray(data.recent_posts) ? data.recent_posts : [])
    .filter((p: any) => p && typeof p.url === 'string')
    .map((p: any) => ({
      url: p.url as string,
      thumbUrl: typeof p.thumb_path === 'string' ? socialCacheUrl(p.thumb_path) : null,
      views: typeof p.views === 'number' ? p.views : null,
      likes: typeof p.likes === 'number' ? p.likes : null,
      type: typeof p.type === 'string' ? p.type : 'Image',
      takenAt: typeof p.takenAt === 'string' ? p.takenAt : (typeof p.taken_at === 'string' ? p.taken_at : null),
    }));

  return {
    followerCount: data.follower_count ?? null,
    postsCount: data.posts_count ?? null,
    avgViews: data.avg_views ?? null,
    engagementRate: data.engagement_rate != null ? Number(data.engagement_rate) : null,
    isVerified: Boolean(data.is_verified),
    profilePicUrl: data.profile_pic_path ? socialCacheUrl(data.profile_pic_path) : null,
    posts,
    fetchedAt: data.fetched_at ?? null,
  };
}
