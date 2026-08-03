import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, emailsEnabled, isValidEmail } from './client';
import { getTemplate, type EmailCategory, type TemplateDef, type TemplateId } from './templates';
import { unsubscribeUrl } from './unsubscribe';

/**
 * Every "should we actually send this?" decision lives here — one place, so the
 * answer can't drift between the 21 notifyUser() call sites, the payment
 * webhook and any future cron.
 *
 * Order matters. Suppression is checked first and has no override: mailing an
 * address that already hard-bounced or filed a spam complaint is the single
 * fastest way to get a sending domain blacklisted, and no product requirement
 * outranks that.
 */

export type SkipReason =
  | 'disabled'
  | 'template_disabled'
  | 'no_recipient'
  | 'unverified'
  | 'suppressed'
  | 'opted_out'
  | 'daily_cap'
  | 'duplicate'
  | 'unknown_template'
  | 'send_failed';

export type DeliveryResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: SkipReason; detail?: string };

/** Tier-B mails per user per day. Beyond this we stop; the in-app feed still has everything. */
const DAILY_CAP = Number(process.env.EMAIL_DAILY_CAP || 6);

/**
 * Per-template kill switch, e.g. `EMAIL_DISABLED_TEMPLATES=payment_failed,unread_messages`.
 *
 * The switches above it are all-or-nothing (`NOTIFY_EMAILS_ENABLED`) or
 * per-person (`email_preferences`). Neither helps with the case this exists for:
 * one template misbehaving — bad copy, a broken link, a loop mailing the same
 * people — where you want that ONE mail silenced in seconds without a deploy and
 * without taking password resets down with it.
 *
 * Read per call rather than cached at module load so changing the variable takes
 * effect on the next send, not the next cold start.
 *
 * Deliberately applies to account-tier mail too. Every other gate exempts
 * tier A, but this one is the operator's override of last resort — if a
 * verification mail is the thing looping, "you may not turn it off" is the
 * wrong answer.
 */
function templateDisabled(templateId: string): boolean {
  const raw = (process.env.EMAIL_DISABLED_TEMPLATES || '').trim();
  if (!raw) return false;
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .includes(templateId.toLowerCase());
}

function service(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * True when the error is "this table doesn't exist yet".
 *
 * This project's hosted database routinely runs a few migrations behind the
 * repo, and email must degrade rather than break when 098 hasn't been applied:
 * a missing preferences table should not stop an account-security mail.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42P01' || /relation .* does not exist/i.test(error?.message || '');
}

// ── Individual checks ───────────────────────────────────────────────────────

async function isSuppressed(sb: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await sb
    .from('email_suppressions')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) {
      console.warn('[email] email_suppressions missing — migration 100 not applied; skipping suppression check');
      return false;
    }
    // Fail OPEN on a transient read error: a database blip should not silence
    // a password reset. The bounce webhook will re-suppress on the next event.
    console.error('[email] suppression check failed:', error.message);
    return false;
  }
  return !!data;
}

async function optedOut(sb: SupabaseClient, userId: string, category: EmailCategory): Promise<boolean> {
  if (category === 'account') return false; // tier A is never optional
  const { data, error } = await sb
    .from('email_preferences')
    .select('collab, project, payment, message, marketing')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return false;
    console.error('[email] preference check failed:', error.message);
    return false;
  }
  // No row = defaults. Marketing defaults OFF, everything else ON.
  if (!data) return category === 'marketing';
  const prefs = data as Record<string, boolean>;
  return prefs[category] === false;
}

async function overDailyCap(sb: SupabaseClient, userId: string, category: EmailCategory): Promise<boolean> {
  if (category === 'account') return false; // security mail is never capped
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from('email_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .neq('category', 'account')
    .gte('created_at', since);
  if (error) {
    if (isMissingTable(error)) return false;
    console.error('[email] daily cap check failed:', error.message);
    return false;
  }
  return (count ?? 0) >= DAILY_CAP;
}

/**
 * Claim the right to send by inserting the ledger row FIRST.
 *
 * Doing it before the Resend call is what makes dedupe real: two concurrent
 * webhook redeliveries both try to insert the same dedupe_key, the unique
 * constraint lets exactly one win, and the loser skips instead of sending a
 * second copy.
 *
 * Returns the row id (null if the ledger is unavailable), or 'duplicate'.
 */
async function claim(
  sb: SupabaseClient,
  row: { userId: string | null; to: string; template: string; category: EmailCategory; dedupeKey?: string },
): Promise<string | null | 'duplicate'> {
  const { data, error } = await sb
    .from('email_deliveries')
    .insert({
      user_id: row.userId,
      to_email: row.to,
      template: row.template,
      category: row.category,
      dedupe_key: row.dedupeKey ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return 'duplicate'; // unique violation on dedupe_key
    if (isMissingTable(error)) {
      console.warn('[email] email_deliveries missing — migration 100 not applied; sending without dedupe');
      return null;
    }
    console.error('[email] ledger insert failed:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function settle(
  sb: SupabaseClient,
  id: string | null,
  patch: { status: string; resend_id?: string | null; error?: string | null },
): Promise<void> {
  if (!id) return;
  const { error } = await sb.from('email_deliveries').update(patch).eq('id', id);
  if (error) console.error('[email] ledger update failed:', error.message);
}

// ── Recipient resolution ────────────────────────────────────────────────────

/**
 * The authoritative address is auth.users.email, not profiles.email — the
 * profile copy is written at signup and never re-synced, so it goes stale the
 * moment someone changes their login address.
 *
 * `email_confirmed_at` comes back from the same call, which is how we avoid a
 * separate "is this address verified" column and its inevitable drift.
 */
async function resolveRecipient(
  sb: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; verified: boolean }> {
  try {
    const { data, error } = await sb.auth.admin.getUserById(userId);
    if (error || !data?.user) return { email: null, verified: false };
    return {
      email: data.user.email ?? null,
      verified: !!data.user.email_confirmed_at,
    };
  } catch (err) {
    console.error('[email] failed to resolve recipient:', err);
    return { email: null, verified: false };
  }
}

/** Default true. Turn off only if Supabase "Confirm email" is disabled and you accept the risk. */
function requireVerified(): boolean {
  return (process.env.EMAIL_REQUIRE_VERIFIED || 'true').trim() !== 'false';
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface DeliverInput {
  /** Recipient profile id. Used for preferences, cap and the unsubscribe token. */
  userId: string;
  /** Typed against the registry so a typo fails to compile, not at send time. */
  templateId: TemplateId;
  data: Record<string, unknown>;
  /**
   * Unique per logical event, e.g. `payment:<razorpay_id>` or
   * `stage:<projectId>:<stage>`. Without one, retries can double-send.
   */
  dedupeKey?: string;
  /** Skips the lookup when the caller already has the verified address. */
  toOverride?: string;
  /**
   * Files this send under a different opt-out category than the template's own.
   *
   * Exists for the `generic` fallback, which has no fixed subject matter: a
   * generic mail triggered by a chat message must obey the `message` opt-out,
   * not `project`. Every other caller should leave this alone.
   */
  categoryOverride?: EmailCategory;
}

export async function deliverEmail(input: DeliverInput): Promise<DeliveryResult> {
  if (!emailsEnabled()) return { sent: false, reason: 'disabled' };

  const tpl = getTemplate(input.templateId);
  if (!tpl) {
    console.error('[email] unknown template:', input.templateId);
    return { sent: false, reason: 'unknown_template' };
  }

  if (templateDisabled(tpl.id)) {
    console.info('[email] template switched off via EMAIL_DISABLED_TEMPLATES:', tpl.id);
    return { sent: false, reason: 'template_disabled' };
  }

  const sb = service();
  if (!sb) {
    console.warn('[email] SUPABASE_SERVICE_ROLE_KEY missing — cannot evaluate send policy');
    return { sent: false, reason: 'no_recipient' };
  }

  const category = input.categoryOverride ?? tpl.category;

  let to = input.toOverride ?? null;
  if (!to) {
    const recipient = await resolveRecipient(sb, input.userId);
    if (!recipient.email) return { sent: false, reason: 'no_recipient' };
    if (!recipient.verified && requireVerified() && category !== 'account') {
      // Account/security mail still goes to an unconfirmed address — that IS
      // the confirmation path. Everything else waits until ownership is proven,
      // so a typo'd address never receives someone else's project details.
      return { sent: false, reason: 'unverified' };
    }
    to = recipient.email;
  }

  if (!isValidEmail(to)) return { sent: false, reason: 'no_recipient' };

  if (await isSuppressed(sb, to)) return { sent: false, reason: 'suppressed' };
  if (await optedOut(sb, input.userId, category)) return { sent: false, reason: 'opted_out' };
  if (await overDailyCap(sb, input.userId, category)) {
    console.info('[email] daily cap reached', { userId: input.userId, template: tpl.id });
    return { sent: false, reason: 'daily_cap' };
  }

  const claimed = await claim(sb, {
    userId: input.userId,
    to,
    template: tpl.id,
    category,
    dedupeKey: input.dedupeKey,
  });
  if (claimed === 'duplicate') return { sent: false, reason: 'duplicate' };

  const result = await renderAndSend(tpl, input.data, to, {
    // Tier A carries no unsubscribe link — an "unsubscribe" footer on a
    // password reset reads as phishing and is not something we can honour.
    unsubscribeUrl: category === 'account' ? undefined : unsubscribeUrl(input.userId, category),
    idempotencyKey: input.dedupeKey,
  });

  if (result.sent) {
    await settle(sb, claimed, { status: 'sent', resend_id: result.id });
    return { sent: true, id: result.id };
  }
  await settle(sb, claimed, {
    status: result.reason === 'error' ? 'failed' : 'skipped',
    error: result.reason === 'error' ? (result.error ?? 'send failed') : result.reason,
  });
  return { sent: false, reason: 'send_failed', detail: result.reason };
}

/**
 * Render a template and hand it to Resend, with none of the policy checks.
 *
 * Used by deliverEmail() after it has decided, and directly by the admin
 * console's test send — where the whole point is to see the mail regardless of
 * the recipient's preferences.
 */
export async function renderAndSend(
  tpl: TemplateDef<any>,
  data: Record<string, unknown>,
  to: string,
  opts: {
    unsubscribeUrl?: string;
    idempotencyKey?: string;
    /**
     * Backfill absent fields from the template's sample.
     *
     * ONLY for the admin console, where a half-filled form should still render.
     * Never for a real send: a call site that forgot `recipientName` would
     * otherwise mail an actual user "Hi Ananya" — sample data is realistic
     * precisely so that mistake would look plausible and go unnoticed.
     */
    fillFromSample?: boolean;
  } = {},
) {
  const merged = opts.fillFromSample ? { ...(tpl.sample as Record<string, unknown>), ...data } : data;
  return sendEmail({
    to,
    subject: tpl.subject(merged),
    html: tpl.render(merged, { unsubscribeUrl: opts.unsubscribeUrl }),
    unsubscribeUrl: opts.unsubscribeUrl,
    idempotencyKey: opts.idempotencyKey,
    tags: { template: tpl.id, category: tpl.category, tier: tpl.tier },
  });
}

/**
 * Hour bucket for rollup dedupe keys.
 *
 * `message:${channelId}:${userId}:${hourBucket()}` gives "at most one message
 * email per conversation per hour" for free — the second message in the same
 * hour collides on dedupe_key and is dropped.
 */
export function hourBucket(date = new Date()): string {
  return date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}
