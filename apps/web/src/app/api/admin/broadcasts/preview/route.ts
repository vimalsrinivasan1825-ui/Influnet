import { NextResponse } from 'next/server';
import { callerClient, jsonError, withAdmin } from '@/lib/api';
import { AudienceSchema } from '@/lib/broadcast-schema';
import { z } from 'zod';

/**
 * POST /api/admin/broadcasts/preview { audience, kind } → { data }
 *
 * Live recipient counts for the composer: total, reachable by push, opted out.
 * Read-only; nothing is created or sent.
 */
const Schema = z.object({
  audience: AudienceSchema.optional(),
  kind: z.enum(['announcement', 'promo', 'tutorial', 'system', 'reminder']).optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await withAdmin(req);
    if (!auth.ok) return auth.res;
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.format() }, { status: 400 });
    }
    const { data, error } = await callerClient(req).rpc('admin_preview_audience', {
      p_segment: parsed.data.audience ?? {},
      p_kind: parsed.data.kind ?? 'announcement',
    });
    if (error) {
      if (/unknown segment key|invalid role|limited to/i.test(error.message ?? '')) {
        return jsonError(400, error.message, error);
      }
      return jsonError(500, 'Could not preview this audience', error);
    }
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(500, 'Could not preview this audience', error);
  }
}
