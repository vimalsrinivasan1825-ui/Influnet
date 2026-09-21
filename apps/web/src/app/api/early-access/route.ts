import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError } from '@/lib/api';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

const EarlyAccessSchema = z.object({
  kind: z.enum(['creator', 'business']),
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  handle: z.string().trim().max(60).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  followers: z.string().trim().max(40).optional().nullable(),
  avatarUrl: z.string().trim().max(600).optional().nullable(),
  bio: z.string().trim().max(500).optional().nullable(),
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(req, {
      bucket: 'early-access:submit',
      limit: 20,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const parsed = EarlyAccessSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const supabase = serviceRoleClient();
    if (!supabase) {
      return jsonError(500, 'Database service is unavailable');
    }

    const cleanEmail = parsed.data.email.toLowerCase();
    const cleanHandle = parsed.data.handle ? parsed.data.handle.replace(/^@/, '').trim().toLowerCase() : null;

    // Check if user already claimed a pass
    const { data: existing } = await supabase
      .from('early_access_signups')
      .select('*')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existing) {
      // Update existing record with latest info so repeated testing/re-submitting updates the pass
      const { data: updatedPass } = await supabase
        .from('early_access_signups')
        .update({
          kind: parsed.data.kind,
          name: parsed.data.name,
          phone: parsed.data.phone || existing.phone || null,
          handle: cleanHandle ?? existing.handle,
          company: parsed.data.company || (parsed.data.kind === 'business' ? parsed.data.name : null) || existing.company,
          website: parsed.data.website || existing.website || null,
          followers: parsed.data.followers || existing.followers || null,
          avatar_url: parsed.data.avatarUrl || existing.avatar_url || null,
          bio: parsed.data.bio || existing.bio || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      return NextResponse.json({
        ok: true,
        alreadyClaimed: true,
        pass: updatedPass ?? existing,
      }, { headers: CORS_HEADERS });
    }

    // Insert new Founder Pass early access record
    const { data: newPass, error: insertErr } = await supabase
      .from('early_access_signups')
      .insert({
        kind: parsed.data.kind,
        name: parsed.data.name,
        email: cleanEmail,
        phone: parsed.data.phone || null,
        handle: cleanHandle,
        company: parsed.data.company || (parsed.data.kind === 'business' ? parsed.data.name : null),
        website: parsed.data.website || null,
        followers: parsed.data.followers || null,
        avatar_url: parsed.data.avatarUrl || null,
        bio: parsed.data.bio || null,
        metadata: {
          submitted_at: new Date().toISOString(),
          ip_source: req.headers.get('x-forwarded-for') || null,
        },
        status: 'confirmed',
      })
      .select('*')
      .single();

    if (insertErr) {
      logger.error('early-access: insert error', { error: insertErr.message });
      return jsonError(500, 'Could not create your Founder Pass', insertErr);
    }

    // Sync to CRM leads so offline sales / admin team can track them
    try {
      await supabase
        .from('crm_leads')
        .insert({
          kind: parsed.data.kind,
          name: parsed.data.name,
          company: parsed.data.company || (parsed.data.kind === 'business' ? parsed.data.name : null),
          email: cleanEmail,
          handle: cleanHandle,
          source: 'inbound',
          stage: 'new',
          tags: ['early_access', 'founder_pass'],
        });

      // Trigger automatic account linker if user already has an account
      await (supabase.rpc as any)('match_crm_leads').catch(() => {});
    } catch (crmErr) {
      // Non-blocking: early_access_signups is the canonical source
      logger.warn('early-access: crm sync warning', { error: String(crmErr) });
    }

    return NextResponse.json(
      {
        ok: true,
        alreadyClaimed: false,
        pass: newPass,
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error) {
    logger.error('early-access: unexpected error', { error: String(error) });
    return jsonError(500, 'Internal server error', error);
  }
}
