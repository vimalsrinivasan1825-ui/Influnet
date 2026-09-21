import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

const PHONE_REGEX = /^\+?[0-9\s\-().]{7,25}$/;

const JoinApplicationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Valid email is required').max(160),
  phone: z
    .string()
    .trim()
    .min(7, 'WhatsApp number is required')
    .max(30)
    .refine((val) => {
      const digits = val.replace(/\D/g, '');
      return digits.length >= 7 && digits.length <= 15 && PHONE_REGEX.test(val);
    }, 'Must be a valid WhatsApp / contact number (7–15 digits)'),
  instagramHandle: z.string().trim().max(100).optional().nullable(),
  creatorType: z.string().trim().min(1, 'Creator category is required').max(80),
  followerTier: z.string().trim().min(1, 'Follower range is required').max(50),
  contentNiches: z.array(z.string().trim().max(50)).min(1, 'Select at least one content niche'),
  brandExperience: z.string().trim().min(1, 'Brand experience is required').max(50),
  biggestChallenge: z.string().trim().max(2000).optional().nullable(),
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
      bucket: 'join-application:submit',
      limit: 15,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const parsed = JoinApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.format() },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const {
      name,
      email,
      phone,
      instagramHandle,
      creatorType,
      followerTier,
      contentNiches,
      brandExperience,
      biggestChallenge,
    } = parsed.data;

    const cleanHandle = instagramHandle ? instagramHandle.replace(/^@/, '').trim() : null;

    const supabase = serviceRoleClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database service is temporarily unavailable' },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const { data: inserted, error: insertError } = await (supabase
      .from('creator_join_applications' as any) as any)
      .insert({
        name,
        email: email.toLowerCase(),
        phone,
        instagram_handle: cleanHandle,
        creator_type: creatorType,
        follower_tier: followerTier,
        content_niches: contentNiches,
        brand_experience: brandExperience,
        biggest_challenge: biggestChallenge || null,
        metadata: {
          userAgent: req.headers.get('user-agent'),
          referer: req.headers.get('referer'),
          ipCountry: req.headers.get('cf-ipcountry') || req.headers.get('x-vercel-ip-country'),
        },
      })
      .select('id, application_number, created_at')
      .single();

    if (insertError) {
      logger.error('Failed to insert creator join application', { error: insertError });
      return NextResponse.json(
        { error: 'Failed to record application. Please try again.' },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        id: inserted.id,
        applicationNumber: inserted.application_number,
        message: 'Application received successfully! Our creator team will review and connect with you via WhatsApp & Email.',
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (error) {
    logger.error('Error handling creator join application submission', { error });
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
