import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Resend delivery webhook.
 *
 * The one job that actually matters here is suppression. A hard bounce or a
 * spam complaint that we keep mailing is what turns a warm sending domain into
 * a blocked one — after which none of our password resets arrive either. So
 * `email.bounced` and `email.complained` write a permanent row in
 * email_suppressions, which lib/email/policy.ts checks before every send.
 *
 * Configure at Resend → Webhooks with URL https://<host>/api/webhooks/resend
 * and put the signing secret in RESEND_WEBHOOK_SECRET.
 */

/**
 * Resend signs with Svix. Verified by hand rather than pulling in the `svix`
 * package for one function: HMAC-SHA256 over `${id}.${timestamp}.${body}`,
 * keyed by the base64 secret with its `whsec_` prefix stripped.
 */
function verifySignature(req: Request, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not set — rejecting');
    return false;
  }

  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject anything older than five minutes so a captured delivery can't be
  // replayed later to re-suppress an address.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');

  // The header holds a space-separated list of `v1,<sig>` — a secret being
  // rotated produces more than one, and any match is valid.
  return signatureHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

function service() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { message?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const sb = service();
  if (!sb) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const type = event.type ?? '';
  const recipients = (Array.isArray(event.data?.to) ? event.data?.to : [event.data?.to])
    .filter((e): e is string => typeof e === 'string' && e.length > 0)
    .map((e) => e.toLowerCase());
  const emailId = event.data?.email_id ?? null;

  const status =
    type === 'email.bounced' ? 'bounced'
    : type === 'email.complained' ? 'complained'
    : type === 'email.delivered' ? 'delivered'
    : null;

  // Mirror the outcome onto the ledger row so "did they get it?" is answerable
  // from our own database rather than the Resend dashboard.
  if (status && emailId) {
    const { error } = await sb.from('email_deliveries').update({ status }).eq('resend_id', emailId);
    if (error) console.error('[resend-webhook] ledger update failed:', error.message);
  }

  if (type === 'email.bounced' || type === 'email.complained') {
    const reason = type === 'email.bounced' ? 'bounced' : 'complained';
    for (const email of recipients) {
      const { error } = await sb.from('email_suppressions').upsert(
        {
          email,
          reason,
          detail: event.data?.bounce?.message ?? null,
        },
        { onConflict: 'email' },
      );
      if (error) console.error('[resend-webhook] suppression insert failed:', error.message);
      else console.warn(`[resend-webhook] suppressed ${email} (${reason})`);
    }
  }

  // Always 200 on a verified event — a non-2xx makes Resend retry, and a
  // suppression we already recorded does not need retrying.
  return NextResponse.json({ ok: true });
}
