import { NextResponse } from 'next/server';
import { jsonError, withAuth } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';

/**
 * Product feedback — "this confused me", not "this person scammed me".
 *
 * Kept separate from `user_reports` (056) on purpose: reporting a PERSON is a
 * safety action with a moderation workflow and consequences for an account,
 * while feedback is a product signal. Collapsing them would bury real safety
 * reports under feature requests.
 */

const KINDS = ['idea', 'bug', 'praise', 'confusion'] as const;

export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(req, {
      bucket: 'feedback:create',
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (limited) return limited;

    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { supabase, user } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      message?: unknown;
      kind?: unknown;
      rating?: unknown;
      surface?: unknown;
    };

    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length < 3 || message.length > 4000) {
      return jsonError(400, 'Feedback needs to be between 3 and 4000 characters');
    }

    const kind =
      typeof body.kind === 'string' && (KINDS as readonly string[]).includes(body.kind)
        ? body.kind
        : 'idea';

    // A rating outside 1-5 would fail the CHECK constraint and surface as an
    // opaque 500; normalise to null instead.
    const ratingRaw = typeof body.rating === 'number' ? Math.round(body.rating) : null;
    const rating = ratingRaw !== null && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

    // Route only — never the full URL, which carries reset tokens and codes.
    const surface =
      typeof body.surface === 'string' ? body.surface.split('?')[0].slice(0, 200) : null;

    const { data, error } = await supabase
      .from('product_feedback')
      .insert({ user_id: user.id, message, kind, rating, surface })
      .select('id, kind, created_at')
      .single();

    if (error) return jsonError(500, 'Could not save your feedback', error);
    return NextResponse.json({ feedback: data }, { status: 201 });
  } catch (error) {
    return jsonError(500, 'Could not save your feedback', error);
  }
}
