import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { UsernameSchema } from '@/lib/validators';

/**
 * Live username availability for the signup / settings forms.
 *
 * Unauthenticated by design — it runs while the user is still typing, before any
 * auth session exists. It answers a single question ("is this handle free?") and
 * never returns row data. Uniqueness is enforced authoritatively in the DB
 * (register_profile + the unique indexes); this endpoint is the fast, friendly
 * pre-check that stops a taken handle from ever reaching "Create account".
 */
export async function GET(req: Request) {
  // Cheap endpoint, but still abusable for username enumeration — cap it.
  const limited = await enforceRateLimit(req, {
    bucket: 'auth:check-username',
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get('username') ?? '';
  const username = raw.trim().toLowerCase();

  // Format / reserved-word validation lives in one place (UsernameSchema). If it
  // fails, report it as a validation reason rather than an availability answer.
  const parsed = UsernameSchema.safeParse(username);
  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      valid: false,
      reason: parsed.error.issues[0]?.message ?? 'Invalid username',
    });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const { data, error } = await supabase.rpc('check_username_available', {
      p_username: username,
    });

    if (error) {
      return jsonError(500, 'Could not check username availability', error);
    }

    return NextResponse.json({ available: data === true, valid: true });
  } catch (error) {
    return jsonError(500, 'Could not check username availability', error);
  }
}
