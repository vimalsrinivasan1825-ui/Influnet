import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceRoleClient } from '@/lib/supabase/service';
import { logger } from '@/lib/logger';

// Pre-event survey for influnet.io/join/survey (landing app, other origin).
//
//   { action: 'lookup', event, phone }
//     → { found: false } | { found: true, registrant, response }
//   { action: 'submit', event, phone, role, answers }
//     → { ok: true }
//
// Registrations come from /api/event-pass (migration 170); answers are stored in
// event_survey_responses (migration 174), one per registration.
//
// The phone number is the only key, so lookup returns just enough to let people
// recognise themselves: first name, city, Instagram handle and a masked email —
// never the full email or phone.

const EVENTS = new Set(['silicon-nexus-s2']);

const Phone = z.string().trim().min(7, 'Please enter your phone number').max(30);
const Event = z.string().trim().refine((v) => EVENTS.has(v), 'Unknown event');

// Answers are keyed by question id (landing: survey-questions.ts). Each is a
// short text or a list of option ids; the bounds keep one submission small.
const Answer = z.union([
  z.string().trim().max(1000),
  z.array(z.string().trim().max(200)).max(20),
]);
const Answers = z
  .record(z.string().regex(/^[a-z0-9_]{1,40}$/), Answer)
  .refine((a) => Object.keys(a).length <= 30, 'Too many answers');

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lookup'), event: Event, phone: Phone }),
  z.object({
    action: z.literal('submit'),
    event: Event,
    phone: Phone,
    role: z.enum(['creator', 'business']),
    answers: Answers,
  }),
]);

/** Digits with country code. Same rules as /api/event-pass so the keys match. */
function normalisePhone(raw: string): string | null {
  if (!/^\+?[0-9\s\-().]{7,30}$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && !raw.trim().startsWith('+')) digits = `91${digits}`;
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.startsWith('91') && digits.length !== 12) return null;
  return digits;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!domain) return null;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
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
    // Per IP, sized for a room of people on one venue Wi-Fi. Lookups are also
    // what someone guessing numbers would hammer, so they share the bucket.
    const limited = await enforceRateLimit(req, {
      bucket: 'event-survey',
      limit: 60,
      windowMs: 60_000,
    });
    if (limited) {
      for (const [k, v] of Object.entries(CORS_HEADERS)) limited.headers.set(k, v);
      return limited;
    }

    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return fail(issue?.message ?? 'Please check your details', 400, issue?.path[0]?.toString());
    }
    const body = parsed.data;

    const phoneDigits = normalisePhone(body.phone);
    if (!phoneDigits) return fail('Please enter a valid 10-digit mobile number', 400, 'phone');

    const supabase = serviceRoleClient();
    if (!supabase) return fail('The survey is temporarily unavailable', 503);

    const { data: reg, error: regError } = await supabase
      .from('event_registrations')
      .select('id, name, email, location, instagram_handle, checked_in_at')
      .eq('event_slug', body.event)
      .eq('phone_digits', phoneDigits)
      .is('deleted_at', null)
      .maybeSingle();
    if (regError) {
      logger.error('event-survey: registration lookup failed', { error: regError });
      return fail('Something went wrong. Please try again.', 500);
    }

    if (body.action === 'lookup') {
      if (!reg) return NextResponse.json({ found: false }, { headers: CORS_HEADERS });
      const { data: prior } = await supabase
        .from('event_survey_responses')
        .select('role, answers, updated_at')
        .eq('registration_id', reg.id)
        .maybeSingle();
      return NextResponse.json(
        {
          found: true,
          registrant: {
            firstName: (reg.name as string).trim().split(/\s+/)[0],
            location: reg.location,
            instagram: reg.instagram_handle,
            emailMasked: maskEmail(reg.email as string | null),
            checkedIn: Boolean(reg.checked_in_at),
          },
          response: prior ?? null,
        },
        { headers: CORS_HEADERS },
      );
    }

    if (!reg) return fail('We couldn’t find a registration for that number', 404, 'phone');

    const { error } = await supabase.from('event_survey_responses').upsert(
      {
        registration_id: reg.id,
        event_slug: body.event,
        role: body.role,
        answers: body.answers,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'registration_id' },
    );
    if (error) {
      logger.error('event-survey: save failed', { error });
      return fail('We couldn’t save your answers. Please try again.', 500);
    }
    return NextResponse.json({ ok: true }, { status: 201, headers: CORS_HEADERS });
  } catch (err) {
    logger.error('event-survey: unexpected error', { error: err });
    return fail('Something went wrong. Please try again.', 500);
  }
}
