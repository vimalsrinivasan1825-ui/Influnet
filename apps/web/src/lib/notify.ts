import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { vendorEnabled } from './feature-flags';
import { sendExpoBatch } from './expo-push';
import { deliverEmail } from './email/policy';
import type { EmailCategory, TemplateId } from './email/templates';

// Notification types persisted in public.notifications.type. The column is
// free-text (migration 047 has no CHECK), so this union is the only place the
// set is pinned down — extend it here when a new kind of row is written.
//
//   verification — the Verified badge landed (or a step toward it)
//   nudge        — re-engagement prompt ("you have unread messages", "3 new
//                  campaigns since you were last here"); mobile push + in-app
//                  card only, never email
//   upsell       — a Pro-gated action was attempted; surfaces the plan
export type NotificationType =
  | 'collab_request'
  | 'collab_accepted'
  | 'collab_declined'
  | 'project_stage'
  | 'project_cancel'
  | 'message'
  | 'verification'
  | 'nudge'
  | 'upsell'
  // Admin broadcast shown in-app (migration 157) — written by lib/broadcasts.ts.
  | 'announcement'
  // Pro renewal reminder (migration 155) — /api/cron/maintenance.
  | 'reminder';

/**
 * Which opt-out category each notification type falls under, so a user who
 * turns off "messages" in settings doesn't also lose payment mail.
 *
 * `verification`/`nudge`/`upsell` map to 'account' only as a formality — none
 * of them pass an `email` option to notifyUser(), so this is never consulted
 * for them. They are in-app + push surfaces.
 */
const CATEGORY_BY_TYPE: Record<NotificationType, EmailCategory> = {
  collab_request: 'collab',
  collab_accepted: 'collab',
  collab_declined: 'collab',
  project_stage: 'project',
  project_cancel: 'project',
  message: 'message',
  verification: 'account',
  nudge: 'account',
  upsell: 'account',
  announcement: 'marketing',
  reminder: 'payment',
};

export interface NotifyEmailOptions {
  /**
   * Template id from lib/email/templates.ts. Omit to use the `generic`
   * layout built from this notification's own title/body/link — fine for
   * one-off events, worth upgrading for anything a user sees often.
   *
   * Typed against the registry so a typo is a compile error rather than a
   * silent `unknown_template` at send time.
   */
  templateId?: TemplateId;
  /** Data for that template. Missing fields fall back to the template's sample. */
  data?: Record<string, unknown>;
  /**
   * Unique per logical event, e.g. `payment:<razorpay_id>`. Without one, a
   * retried webhook sends the mail twice. For rollups, include an hour bucket:
   * `message:<channelId>:<userId>:<hourBucket()>`.
   */
  dedupeKey?: string;
  /** Files the send under a different opt-out category than the type implies. */
  category?: EmailCategory;
}

export interface NotifyInput {
  /** Recipient profile id. */
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** In-app path, e.g. /dashboard/projects/<id>. */
  link?: string | null;
  /**
   * Email for this notification.
   *
   * Default is NO email — an in-app row plus a push is the baseline, and email
   * is an escalation you opt into per call site. That default is deliberate:
   * this function has ~21 call sites, some of them per chat message, and
   * flipping them all on at once is how a sending domain gets blacklisted.
   */
  email?: NotifyEmailOptions | false;
}

// A service-role client is required because a notification is written for a
// DIFFERENT user than the caller, which the row-level security policies on
// `notifications` (self-scoped SELECT/UPDATE, no INSERT policy) would reject.
function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Push the notification to every active device the recipient has registered
 * (migration 156's `push_devices`; falls back to 079's single
 * `profiles.expo_push_token` on a database that predates it).
 *
 * Without this, `notifications` rows only reach someone who happens to open
 * the app — for a turn-based product ("waiting on the creator") that means
 * the other side finds out only on their next visit. This is best-effort in
 * every sense: no device, missing migration, or a failed Expo request all just
 * log and return — a push is a bonus, never a dependency of the action that
 * triggered it.
 */
async function sendPush(
  sb: NonNullable<ReturnType<typeof serviceClient>>,
  userId: string,
  title: string,
  body: string,
  link: string | null,
): Promise<void> {
  try {
    // Push is a best-effort side channel: the user's action already succeeded
    // by this point, so neither the kill switch nor the breaker nor a deadline
    // may hold up the request that triggered it.
    if (!vendorEnabled('vendor_expo_push')) return;

    let tokens: string[] = [];
    const devices = await sb
      .from('push_devices')
      .select('expo_token')
      .eq('user_id', userId)
      .is('disabled_at', null)
      .eq('permission', 'granted')
      .order('last_seen_at', { ascending: false })
      .limit(10);
    if (!devices.error) {
      tokens = (devices.data ?? []).map((d: { expo_token: string }) => d.expo_token);
    } else {
      const { data } = await sb.from('profiles').select('expo_push_token').eq('id', userId).maybeSingle();
      const token = (data as { expo_push_token?: string | null } | null)?.expo_push_token;
      if (token) tokens = [token];
    }
    if (tokens.length === 0) return;

    const tickets = await sendExpoBatch(
      tokens.map((to) => ({
        to,
        title,
        body,
        // The mobile app reads this on tap to deep-link — see
        // lib/notification-link.ts's toMobileHref().
        data: link ? { link } : undefined,
      })),
      'expo_push',
    );

    /**
     * DeviceNotRegistered (app uninstalled, token rotated) is the common
     * refusal, and left in place it means every later push to that device is
     * silently dropped, so the dead device is switched off here.
     */
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket.status === 'ok') return;
        console.error('[notify] Expo push ticket error:', ticket.message, ticket.details);
        if (ticket.details?.error !== 'DeviceNotRegistered') return;
        const dead = tokens[i];
        await sb
          .from('push_devices')
          .update({ disabled_at: new Date().toISOString(), disabled_reason: 'DeviceNotRegistered' })
          .eq('expo_token', dead);
        await sb.from('profiles').update({ expo_push_token: null }).eq('id', userId).eq('expo_push_token', dead);
      }),
    );
  } catch (err) {
    console.error('[notify] exception while sending push:', err);
  }
}

/**
 * Third channel: email, but only when the call site asked for it.
 *
 * Every gate that decides whether this actually leaves the building — opt-outs,
 * suppression list, daily cap, dedupe — lives in lib/email/policy.ts. This
 * function only translates a notification into that call. Best-effort in the
 * same sense as push: it swallows everything.
 */
async function maybeEmail(input: NotifyInput): Promise<void> {
  if (!input.email) return;
  try {
    const opts = input.email;
    const templateId = opts.templateId ?? 'generic';
    const data =
      opts.data ??
      // Generic fallback: reuse the notification's own copy so a call site can
      // opt into email without authoring a template first.
      {
        title: input.title,
        body: input.body ?? '',
        link: input.link ?? '/dashboard',
        ctaLabel: 'Open Influnet',
      };

    const result = await deliverEmail({
      userId: input.userId,
      templateId,
      data,
      dedupeKey: opts.dedupeKey,
      // A real template already knows its own category; only the shapeless
      // `generic` one needs to borrow it from the notification type.
      categoryOverride:
        opts.category ?? (templateId === 'generic' ? CATEGORY_BY_TYPE[input.type] : undefined),
    });

    if (!result.sent && result.reason !== 'disabled' && result.reason !== 'duplicate') {
      console.info('[notify] email not sent:', result.reason, { template: templateId });
    }
  } catch (err) {
    console.error('[notify] exception while sending email:', err);
  }
}

/**
 * Fan a new chat message out to the other participants.
 *
 * Lives here because there are two ways a message arrives — the Stream webhook
 * and the REST messages endpoint — and they must behave identically.
 *
 * Chat notifications are IN-APP + PUSH ONLY. There is deliberately no email
 * here: mobile push already covers a new message, and an email on top of that
 * — even the old one-per-hour rollup — was pure noise for anyone with the app,
 * and fired the instant the first message of a clock hour landed regardless of
 * whether the recipient was sitting in the conversation reading it. Every other
 * email (welcome, collab, payment) is unaffected; they run from their own call
 * sites. The `unread_messages` template is kept for admin/manual use only.
 */
export async function notifyNewMessage(input: {
  conversationId: string;
  recipientIds: string[];
  senderName: string;
  text: string;
}): Promise<void> {
  const { conversationId, recipientIds, senderName, text } = input;
  if (recipientIds.length === 0) return;

  const preview = text.length > 100 ? `${text.slice(0, 97)}...` : text;
  const chatLink = `/dashboard/messages?conv=${conversationId}`;

  for (const userId of recipientIds) {
    await notifyUser({
      userId,
      type: 'message',
      title: `New message from ${senderName}`,
      body: preview,
      link: chatLink,
    });
  }
}

/**
 * Best-effort notification write. This NEVER throws: a failed notification must
 * not roll back or break the action that triggered it (advancing a stage, etc.).
 * Returns whether the row was written so callers can log if they care.
 */
export async function notifyUser(input: NotifyInput): Promise<boolean> {
  try {
    const sb = serviceClient();
    if (!sb) {
      console.warn('[notify] SUPABASE_SERVICE_ROLE_KEY missing — skipping notification');
      return false;
    }
    const { error } = await sb.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      link: input.link ?? null,
    });
    if (error) {
      console.error('[notify] failed to insert notification:', error.message);
      return false;
    }
    await sendPush(sb, input.userId, input.title, input.body ?? '', input.link ?? null);
    await maybeEmail(input);
    return true;
  } catch (err) {
    console.error('[notify] exception while notifying:', err);
    return false;
  }
}
