import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

// Public event registration for influnet.io/join (landing app, other origin).
// Returns { ok, passCode, name, alreadyRegistered } — the pass is minted by
// register_for_event() (migration 170), which also dedupes by phone per event.

const EVENTS = new Set(['silicon-nexus-s2']);

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const Schema = z.object({
  event: z.string().trim().refine((v) => EVENTS.has(v), 'Unknown event'),
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  phone: z.string().trim().min(7, 'Please enter your phone number').max(30),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .nullable()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Please enter a valid email')
    .transform((v) => (v ? v.toLowerCase() : null)),
  location: optionalText(120),
  instagram: optionalText(200),
});

/** Digits with country code. A bare 10-digit Indian mobile gets 91 in front. */
function normalisePhone(raw: string): string | null {
  if (!/^\+?[0-9\s\-().]{7,30}$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && !raw.trim().startsWith('+')) digits = `91${digits}`;
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.startsWith('91') && digits.length !== 12) return null;
  return digits;
}

/** Accepts "@handle", "handle" or an instagram.com URL; returns the bare handle. */
function normaliseInstagram(raw: string | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  const url = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(v) ? v : null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function fail(error: string, status: number, field?: string) {
  return NextResponse.json({ error, field }, { status, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(req, {
      bucket: 'event-pass:register',
      limit: 10,
      windowMs: 60_000,
    });
    if (limited) return limited;

    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? 'Please check your details', 400, issue?.path[0]?.toString());
    }
    const { event, name, phone, email, location, instagram } = parsed.data;

    const phoneDigits = normalisePhone(phone);
    if (!phoneDigits) return fail('Please enter a valid 10-digit mobile number', 400, 'phone');

    const handle = normaliseInstagram(instagram);
    if (instagram && !handle) return fail('That Instagram handle doesn’t look right', 400, 'instagram');

    const supabase = serviceRoleClient();
    if (!supabase) return fail('Registration is temporarily unavailable', 503);

    const { data, error } = await supabase.rpc('register_for_event', {
      p_event_slug: event,
      p_name: name,
      p_phone: phone,
      p_phone_digits: phoneDigits,
      p_email: email ?? '',
      p_location: location ?? '',
      p_instagram_handle: handle ?? '',
      p_metadata: {
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        referer: req.headers.get('referer')?.slice(0, 300) ?? null,
      },
    });

    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) {
      logger.error('event-pass: register_for_event failed', { error });
      return fail('We couldn’t save your registration. Please try again.', 500);
    }

    return NextResponse.json(
      {
        ok: true,
        passCode: row.pass_code as string,
        // Echo the name just typed, not the stored one: a repeat phone number
        // must not reveal who registered it.
        name,
        alreadyRegistered: Boolean(row.already_registered),
      },
      { status: row.already_registered ? 200 : 201, headers: CORS_HEADERS },
    );
  } catch (err) {
    logger.error('event-pass: unexpected error', { error: err });
    return fail('Something went wrong. Please try again.', 500);
  }
}
