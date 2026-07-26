import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import { getInstagramUser } from '@/lib/apify-instagram';
import { captureInstagramSnapshot } from '@/lib/social-snapshot';
import { refreshYouTubeSnapshot } from '@/lib/youtube';

export async function POST(req: Request) {
  try {
    const supabase = await createRSCClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get the creator's connected handles. They live on influencer_profiles
    //    (keyed by user_id), NOT the base profiles table. Checked BEFORE the rate
    //    limiter so a creator with no handle doesn't burn their refresh window.
    const { data: profile, error: profileError } = (await supabase
      .from('influencer_profiles')
      .select('instagram_handle, youtube_handle')
      .eq('user_id', user.id)
      .maybeSingle()) as any;

    if (profileError || !profile) {
      return NextResponse.json({ error: 'No creator profile found' }, { status: 400 });
    }

    const igHandle: string | null = profile.instagram_handle || null;
    const ytHandle: string | null = profile.youtube_handle || null;

    if (!igHandle && !ytHandle) {
      return NextResponse.json({ error: 'No Instagram or YouTube handle connected' }, { status: 400 });
    }

    // 3. Enforce Rate Limit, placed right before the expensive work so cheap
    //    early rejections above don't consume the window. Two buckets, because
    //    the two refreshes cost very different things: the Instagram scrape is
    //    billed per call (1 per 5 hours), while YouTube is a public feed fetch
    //    and can be refreshed as often as a creator reasonably would.
    const limited = igHandle
      ? await enforceRateLimit(req, { bucket: 'profile:refresh', limit: 1, windowMs: 5 * 60 * 60 * 1000 })
      : await enforceRateLimit(req, { bucket: 'profile:refresh:youtube', limit: 4, windowMs: 60 * 60 * 1000 });
    if (limited) {
      return NextResponse.json(
        {
          error: igHandle
            ? 'You can only refresh your data once every 5 hours.'
            : 'You can refresh your YouTube data a few times an hour. Try again shortly.',
        },
        { status: 429 }
      );
    }

    // 4. Instagram: scrape fresh data and capture the snapshot.
    let instagram = false;
    if (igHandle) {
      const hikerUser = await getInstagramUser(igHandle);
      if (hikerUser) {
        instagram = await captureInstagramSnapshot(user.id, hikerUser);
      }
    }

    // 5. YouTube: public Atom feed, no API key, no billing. A failure here never
    //    fails the request — a creator with both platforms connected should not
    //    lose their (rate-limited, paid) Instagram refresh because a channel
    //    handle no longer resolves.
    let youtube = false;
    if (ytHandle) {
      youtube = !!(await refreshYouTubeSnapshot(user.id, ytHandle));
    }

    if (!instagram && !youtube) {
      return NextResponse.json(
        { error: 'Could not refresh your social data. Check your connected handles and try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, instagram, youtube });
  } catch (err: any) {
    console.error('Refresh API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
