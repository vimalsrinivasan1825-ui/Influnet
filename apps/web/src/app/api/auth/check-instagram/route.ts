import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

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

    return NextResponse.json({ available: data === true, valid: true });
  } catch (error) {
    return jsonError(500, 'Could not check instagram availability', error);
  }
}
