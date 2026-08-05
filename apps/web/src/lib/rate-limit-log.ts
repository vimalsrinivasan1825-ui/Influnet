import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Best-effort visibility into the rate limiter (rate-limit.ts).
 *
 * Same shape as admin-audit.ts's serviceClient()/never-throws pattern: this
 * must never add latency or a new failure mode to the ~30 routes calling
 * checkRateLimit(), so the caller fires this without awaiting it.
 */

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function recordRateLimitHit(input: {
  bucket: string;
  identity: string;
  ok: boolean;
  limit: number;
}): Promise<void> {
  try {
    const sb = serviceClient();
    if (!sb) return;

    const windowStart = new Date();
    windowStart.setMinutes(0, 0, 0);

    const { error } = await sb.rpc('record_rate_limit_hit', {
      p_bucket: input.bucket,
      p_identity: input.identity,
      p_window_start: windowStart.toISOString(),
      p_limited: !input.ok,
      p_limit: input.limit,
    });
    if (error) console.error('[rate-limit-log] failed to record hit:', error.message);
  } catch (err) {
    console.error('[rate-limit-log] exception while recording hit:', err);
  }
}
