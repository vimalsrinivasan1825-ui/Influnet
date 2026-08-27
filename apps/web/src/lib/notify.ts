import { createClient as createSupabaseClient } from '@supabase/supabase-js';
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
  | 'upsell';

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
 * Push the notification to the recipient's phone, if they have one registered
 * (migration 079's `profiles.expo_push_token`, set by the mobile app on
 * launch — see apps/mobile/lib/push.ts).
 *
 * Without this, `notifications` rows only reach someone who happens to open
 * the app — for a turn-based product ("waiting on the creator") that means
 * the other side finds out only on their next visit. This is best-effort in
 * every sense: no token, missing migration, or a failed Expo request all just
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
    const { data, error } = await sb
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .maybeSingle();
    if (error) return; // migration 079 not applied yet — no column to read
    const token = (data as { expo_push_token?: string | null } | null)?.expo_push_token;
    if (!token) return;

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: token,
        title,
        body,
        sound: 'default',
        // Android routes by channel; 'default' is the one the app creates at
        // MAX importance (apps/mobile/lib/push.ts). Without naming it here the
        // notification can land on a lower-importance fallback channel and
        // never show a heads-up banner. `priority: high` is the FCM-side
        // equivalent — it also lets the message wake a dozing device.
        channelId: 'default',
        priority: 'high',
        // The mobile app reads this on tap to deep-link — see
        // lib/notification-link.ts's toMobileHref().
        data: link ? { link } : undefined,
      }),
    });
    if (!res.ok) {
      console.error('[notify] Expo push request failed:', res.status, await res.text().catch(() => ''));
      return;
    }

    /**
     * Expo answers 200 even when it refuses the message — the verdict is in
     * the ticket. DeviceNotRegistered (app uninstalled, token rotated) is the
     * common one, and left in place it means every later push for this user is
     * silently dropped, so the dead token is cleared here.
     */
    const ticket = (await res.json().catch(() => null)) as
      | { data?: { status?: string; message?: string; details?: { error?: string } } }
      | null;
    const status = ticket?.data?.status;
    if (status && status !== 'ok') {
      console.error('[notify] Expo push ticket error:', ticket?.data?.message, ticket?.data?.details);
      if (ticket?.data?.details?.error === 'DeviceNotRegistered') {
        await sb.from('profiles').update({ expo_push_token: null }).eq('id', userId);
      }
    }
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
