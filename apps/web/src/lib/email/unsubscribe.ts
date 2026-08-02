import { createHmac, timingSafeEqual } from 'crypto';
import { appUrl } from './theme';
import type { EmailCategory } from './templates';

/**
 * Signed unsubscribe links.
 *
 * The link must work without logging in — someone who wants out of our mail
 * will not create a session to do it, they will hit "report spam" instead, and
 * that costs the whole domain. So the token itself carries the authority, which
 * is why it is HMAC-signed: without a signature, `?user=<uuid>&cat=message`
 * would let anyone unsubscribe anyone.
 *
 * Deliberately non-expiring — a two-year-old email's unsubscribe link must
 * still work.
 */

function secret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('EMAIL_UNSUBSCRIBE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is required to sign unsubscribe links');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function unsubscribeToken(userId: string, category: EmailCategory | 'all'): string {
  const payload = Buffer.from(`${userId}.${category}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { userId: string; category: EmailCategory | 'all' } | null {
  try {
    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const payload = token.slice(0, idx);
    const provided = Buffer.from(token.slice(idx + 1));
    const expected = Buffer.from(sign(payload));
    if (provided.length !== expected.length) return null;
    if (!timingSafeEqual(provided, expected)) return null;

    const [userId, category] = Buffer.from(payload, 'base64url').toString('utf8').split('.');
    if (!userId || !category) return null;
    return { userId, category: category as EmailCategory | 'all' };
  } catch {
    return null;
  }
}

/** Absolute URL put in the footer and the List-Unsubscribe header. */
export function unsubscribeUrl(userId: string, category: EmailCategory | 'all'): string {
  return `${appUrl()}/api/email/unsubscribe?t=${unsubscribeToken(userId, category)}`;
}
