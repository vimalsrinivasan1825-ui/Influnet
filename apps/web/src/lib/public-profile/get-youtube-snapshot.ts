// Server-side read of a creator's captured YouTube snapshot (see lib/youtube.ts
// for the capture side). Mirrors get-instagram-snapshot.ts so the public
// profile, the media kit and the dashboard consume both platforms identically.

import { createClient } from '@supabase/supabase-js';

// Anon client — social_snapshots is public-read by design.
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface YouTubeVideoView {
  /** Permanent youtube.com/watch link. */
  url: string;
  title: string;
  /** i.ytimg.com URL — never expires, so no bucket caching (unlike Instagram). */
  thumbUrl: string | null;
  views: number | null;
  likes: number | null;
  publishedAt: string | null;
}

export interface YouTubeSnapshotView {
  /** Subscribers as read off the channel page; null when it couldn't be parsed. */
  subscriberCount: number | null;
  /** Mean views across the recent uploads that reported a count. */
  avgViews: number | null;
  handle: string | null;
  videos: YouTubeVideoView[];
  fetchedAt: string | null;
}

export async function getYouTubeSnapshot(userId: string): Promise<YouTubeSnapshotView | null> {
  const { data, error } = await supabaseAnon
    .from('social_snapshots')
    .select('follower_count, avg_views, handle, recent_posts, fetched_at')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
    .maybeSingle();
  if (error || !data) return null;

  const videos = (Array.isArray(data.recent_posts) ? data.recent_posts : [])
    .filter((v: any) => v && typeof v.url === 'string')
    .map((v: any) => ({
      url: v.url as string,
      title: typeof v.title === 'string' ? v.title : 'Untitled',
      thumbUrl: typeof v.thumb_url === 'string' ? v.thumb_url : null,
      views: typeof v.views === 'number' ? v.views : null,
      likes: typeof v.likes === 'number' ? v.likes : null,
      publishedAt: typeof v.taken_at === 'string' ? v.taken_at : null,
    }));

  return {
    subscriberCount: data.follower_count ?? null,
    avgViews: data.avg_views ?? null,
    handle: data.handle ?? null,
    videos,
    fetchedAt: data.fetched_at ?? null,
  };
}
