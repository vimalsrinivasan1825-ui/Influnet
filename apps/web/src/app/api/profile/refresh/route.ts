import { NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createRSCClient } from '@/lib/supabase/server-rsc';
import { getInstagramUser } from '@/lib/apify-instagram';
import { captureInstagramSnapshot } from '@/lib/social-snapshot';

export async function POST(req: Request) {
  try {
    const supabase = await createRSCClient();
    
    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get the creator's Instagram handle. It lives on influencer_profiles
    //    (keyed by user_id), NOT the base profiles table. Checked BEFORE the rate
    //    limiter so a creator with no handle doesn't burn their refresh window.
    const { data: profile, error: profileError } = (await supabase
      .from('influencer_profiles')
      .select('instagram_handle')
      .eq('user_id', user.id)
      .maybeSingle()) as any;

    if (profileError || !profile || !profile.instagram_handle) {
      return NextResponse.json({ error: 'No Instagram handle connected' }, { status: 400 });
    }

    // 3. Enforce Rate Limit: 1 request per 5 hours. Placed right before the
    //    expensive scrape (the thing we're actually guarding) so cheap early
    //    rejections above don't consume the window.
    const limited = await enforceRateLimit(req, {
      bucket: 'profile:refresh',
      limit: 1,
      windowMs: 5 * 60 * 60 * 1000,
    });
    if (limited) {
      return NextResponse.json(
        { error: 'You can only refresh your data once every 5 hours.' },
        { status: 429 }
      );
    }

    // 4. Scrape fresh data
    const hikerUser = await getInstagramUser(profile.instagram_handle);
    if (!hikerUser) {
      return NextResponse.json({ error: 'Failed to fetch Instagram profile' }, { status: 500 });
    }

    // 5. Capture snapshot and cache
    const success = await captureInstagramSnapshot(user.id, hikerUser);
    if (!success) {
      return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Refresh API Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
