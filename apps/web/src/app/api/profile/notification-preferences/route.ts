import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, withAuth } from '@/lib/api';

/**
 * GET /api/profile/notification-preferences → { preferences }
 * PUT /api/profile/notification-preferences { category, push, email } → { ok }
 *
 * Per-category opt-out for admin broadcasts (migration 157). Transactional
 * notifications — stage changes, payments, messages — are deliberately NOT
 * listed here: they are the product working, not marketing.
 */
const Schema = z.object({
  category: z.enum(['announcements', 'promotions', 'tips']),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const { data, error } = await auth.supabase.rpc('get_my_notification_preferences');
    if (error) {
      // Database behind migration 157 — everything is on by default.
      return NextResponse.json({
        preferences: {
          announcements: { push: true, email: true },
          promotions: { push: true, email: true },
          tips: { push: true, email: true },
        },
      });
    }
    return NextResponse.json({ preferences: data ?? {} });
  } catch (error) {
    return jsonError(500, 'Could not load your notification settings', error);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await withAuth(req);
    if (!auth.ok) return auth.res;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { error } = await auth.supabase.rpc('set_my_notification_preference', {
      p_category: parsed.data.category,
      p_push: parsed.data.push ?? null,
      p_email: parsed.data.email ?? null,
    });
    if (error) return jsonError(500, 'Could not save that setting', error);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(500, 'Could not save that setting', error);
  }
}
