import { Resend } from 'resend';
import { supportEmail } from './theme';

/**
 * The only place that talks to Resend.
 *
 * Contract, same as notifyUser(): this NEVER throws. A failed email must not
 * roll back the action that triggered it — nobody should lose a payment record
 * because an inbox was full.
 */

let client: Resend | null = null;

function resend(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Adds List-Unsubscribe headers. Required by Gmail/Yahoo for bulk senders. */
  unsubscribeUrl?: string;
  /** Resend tags — makes the dashboard filterable by template. Keys/values must be ASCII word chars. */
  tags?: Record<string, string>;
  /** Set for retryable sends so Resend collapses duplicates on its side too. */
  idempotencyKey?: string;
}

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: 'disabled' | 'no_key' | 'not_allowlisted' | 'invalid_address' | 'error'; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string | null | undefined): boolean {
  return !!value && EMAIL_RE.test(value.trim());
}

/** Master switch. Off in dev/staging by default so nobody mails real users by accident. */
export function emailsEnabled(): boolean {
  // Trailing inline comments in .env files survive in some loaders, so compare
  // on the first token rather than the raw string.
  return (process.env.NOTIFY_EMAILS_ENABLED || '').trim().split(/\s+/)[0] === 'true';
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Staging safety net: when EMAIL_ALLOWLIST is set, only addresses matching it
 * can be mailed. Entries are either full addresses or `@domain.com` suffixes.
 *
 * This is what stops a staging environment pointed at the production database
 * from mailing every real user during a test.
 */
function allowlisted(to: string): boolean {
  const raw = (process.env.EMAIL_ALLOWLIST || '').trim();
  if (!raw) return true;
  const addr = to.trim().toLowerCase();
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith('@') ? addr.endsWith(entry) : addr === entry));
}

export function fromAddress(): string {
  return process.env.EMAIL_FROM || 'Influnet <noreply@influnet.io>';
}

export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  if (!emailsEnabled()) {
    console.info('[email] skipped — NOTIFY_EMAILS_ENABLED is not "true"', { subject: input.subject });
    return { sent: false, reason: 'disabled' };
  }
  if (!isValidEmail(input.to)) {
    return { sent: false, reason: 'invalid_address' };
  }
  if (!allowlisted(input.to)) {
    console.warn('[email] blocked by EMAIL_ALLOWLIST', { to: input.to });
    return { sent: false, reason: 'not_allowlisted' };
  }

  const api = resend();
  if (!api) {
    console.warn('[email] RESEND_API_KEY missing — nothing sent');
    return { sent: false, reason: 'no_key' };
  }

  const headers: Record<string, string> = {};
  if (input.unsubscribeUrl) {
    // Gmail and Yahoo require both for bulk senders, and the one-click POST
    // form is what makes the native "Unsubscribe" button appear next to the
    // sender name instead of a spam report.
    headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  if (input.idempotencyKey) {
    headers['Idempotency-Key'] = input.idempotencyKey;
  }

  try {
    const { data, error } = await api.emails.send({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo || supportEmail(),
      headers: Object.keys(headers).length ? headers : undefined,
      tags: input.tags
        ? Object.entries(input.tags).map(([name, value]) => ({
            // Resend rejects tags containing anything but ASCII letters,
            // numbers, underscores and dashes.
            name: name.replace(/[^A-Za-z0-9_-]/g, '_'),
            value: String(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256),
          }))
        : undefined,
    });

    if (error) {
      console.error('[email] Resend rejected the send:', error.message);
      return { sent: false, reason: 'error', error: error.message };
    }
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[email] exception while sending:', message);
    return { sent: false, reason: 'error', error: message };
  }
}
