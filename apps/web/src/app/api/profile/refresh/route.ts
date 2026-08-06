import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { withAuth, jsonError } from '@/lib/api';
import { getInstagramUser } from '@/lib/apify-instagram';
import { captureInstagramSnapshot, captureSocialSnapshot } from '@/lib/social-snapshot';
import { refreshYouTubeSnapshot } from '@/lib/youtube';
import { getSocialHandler, SocialProviderError, type SocialPlatform } from '@/lib/social';
import { logger } from '@/lib/logger';

/**
 * Apify actors run synchronously and can take ~15–50s each. With Facebook and X
 * now refreshing alongside Instagram, the default serverless cap is not enough
 * for a creator who has connected all three.
 */
export const maxDuration = 120;

/**
 * Refresh one Apify-billed platform. Never throws: a provider outage on X must
 * not cost the creator the Instagram refresh they actually came for (and which
 * their rate-limit window has already been spent on).
 */
async function refreshPlatform(
  userId: string,
  platform: SocialPlatform,
  handle: string,
): Promise<boolean> {
  const handler = getSocialHandler(platform);
  if (!handler?.supported || !handler.isConfigured()) return false;
  try {
    const profile = await handler.fetchProfile(handle);
    if (!profile) return false;

    // Content, when the platform needs a second call for it (Facebook). Only
    // in-app refreshes pay for this — the signup preview deliberately doesn't,
    // since all it owes the creator is "we can see this account".
    if (handler.fetchPosts && profile.recentPosts.length === 0 && !profile.isPrivate) {
      profile.recentPosts = await handler.fetchPosts(handle);
    }

    return await captureSocialSnapshot(userId, profile);
  } catch (err) {
    logger.warn('profile refresh: platform leg failed (non-fatal)', {
      userId,
      platform,
      error: err instanceof SocialProviderError ? `${err.kind}: ${err.message}` : String(err),
    });
    return false;
  }
}

export async function POST(req: Request) {
  try {
    console.log('[DEBUG] POST /api/profile/refresh called');
    const authHeader = req.headers.get('Authorization');
    console.log('[DEBUG] Authorization Header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'NONE');
    const auth = await withAuth(req);
    if (!auth.ok) {
      console.log('[DEBUG] withAuth check FAILED:', auth.res.status);
      return auth.res;
    }
    const { supabase, user } = auth;
    console.log('[DEBUG] withAuth succeeded for user:', user.id);

    // 2. Get the creator's connected handles. They live on influencer_profiles
    //    (keyed by user_id), NOT the base profiles table. Checked BEFORE the rate
    //    limiter so a creator with no handle doesn't burn their refresh window.
    const { data: profile, error: profileError } = (await supabase
      .from('influencer_profiles')
      .select('instagram_handle, youtube_handle, facebook_handle, twitter_handle')
      .eq('user_id', user.id)
      .maybeSingle()) as any;

    if (profileError || !profile) {
      return NextResponse.json({ error: 'No creator profile found' }, { status: 400 });
    }

    const igHandle: string | null = profile.instagram_handle || null;
    // A channel we have captured before stays refreshable even if the profile
    // column is empty: creators reach this route from "Refresh", expecting the
    // numbers on their page to update, and silently skipping the YouTube leg is
    // how a stale subscriber count survives every refresh the creator tries.
    let ytHandle: string | null = profile.youtube_handle || null;
    if (!ytHandle) {
      const { data: captured } = await supabase
        .from('social_snapshots')
        .select('handle')
        .eq('user_id', user.id)
        .eq('platform', 'youtube')
        .maybeSingle();
      ytHandle = (captured as { handle: string | null } | null)?.handle || null;
    }

    const fbHandle: string | null = profile.facebook_handle || null;
    const xHandle: string | null = profile.twitter_handle || null;

    if (!igHandle && !ytHandle && !fbHandle && !xHandle) {
      return NextResponse.json({ error: 'No social handles connected' }, { status: 400 });
    }

    // 3. Enforce Rate Limit, placed right before the expensive work so cheap
    //    early rejections above don't consume the window. Two buckets, because
    //    the two refreshes cost very different things: the Instagram scrape is
    //    billed per call (1 per 5 hours), while YouTube is a public feed fetch
    //    and can be refreshed as often as a creator reasonably would.
    //    Facebook and X are billed the same way as Instagram, so any of the
    //    three puts the request in the paid bucket; the cheap YouTube-only
    //    bucket applies exactly when no paid platform is connected.
    const paidRefresh = !!(igHandle || fbHandle || xHandle);
    const limited = paidRefresh
      ? await enforceRateLimit(req, { bucket: 'profile:refresh', limit: 1, windowMs: 5 * 60 * 60 * 1000 })
      : await enforceRateLimit(req, { bucket: 'profile:refresh:youtube', limit: 4, windowMs: 60 * 60 * 1000 });
    if (limited) {
      return NextResponse.json(
        {
          error: paidRefresh
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

    // 6. Facebook and X, in parallel with each other — two independent actor
    //    runs, and running them in series would double the wall clock a
    //    creator with both connected waits on.
    const [facebook, twitter] = await Promise.all([
      fbHandle ? refreshPlatform(user.id, 'facebook', fbHandle) : Promise.resolve(false),
      xHandle ? refreshPlatform(user.id, 'twitter', xHandle) : Promise.resolve(false),
    ]);

    if (!instagram && !youtube && !facebook && !twitter) {
      return NextResponse.json(
        { error: 'Could not refresh your social data. Check your connected handles and try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, instagram, youtube, facebook, twitter });
  } catch (err: any) {
    console.error('Refresh API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
