import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { fetchInstagramProfile } from '@/lib/instagram';

export async function GET(req: Request) {
  const limited = await enforceRateLimit(req, {
    bucket: 'auth:check-instagram',
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const url = new URL(req.url);
  const handle = url.searchParams.get('handle') ?? '';
  const cleanHandle = handle.replace(/^@/, '').trim().toLowerCase();

  if (cleanHandle.length < 1) {
    return NextResponse.json({
      available: false,
      valid: false,
      reason: 'Handle too short.',
    });
  }

  try {
    // Check against Supabase
    // We use the service role or anon key to check existence safely via our security definer RPC
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabase.rpc('check_instagram_available', {
      p_handle: cleanHandle,
    });

    if (error) {
      return jsonError(500, 'Could not check instagram availability', error);
    }

    if (data === true) {
      // It is not claimed in our DB. Let's verify it actually exists on Instagram
      // using the configured verification provider (Apify or HikerAPI).
      try {
        const profile = await fetchInstagramProfile(cleanHandle);
        if (!profile) {
          return NextResponse.json({
            available: true, // It's not in our DB
            valid: false,    // But it's not a real IG account
            reason: 'This Instagram account does not exist.',
          });
        }
      } catch (err: any) {
        // If the provider fails (timeout, rate limit, exhausted credits), we
        // shouldn't block the user from signing up. Just let it through.
      }
    }

    return NextResponse.json({ available: data === true, valid: true });
  } catch (error) {
    return jsonError(500, 'Could not check instagram availability', error);
  }
}
