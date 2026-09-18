import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverEmail } from './email/policy';
import { vendorEnabled } from './feature-flags';
import { logger } from './logger';
import {
  EXPO_BATCH,
  EXPO_RECEIPT_BATCH,
  getExpoReceipts,
  sendExpoBatch,
  type ExpoMessage,
} from './expo-push';

/**
 * The broadcast sender (migration 157). SQL decides WHO and WHEN; this module
 * only delivers what claim_broadcast_deliveries() hands it and records the
 * outcome on the same row.
 *
 * One cycle = due runs → enqueue → push → in-app → email → receipts → stats.
 * Invoked by POST /api/cron/broadcasts every few minutes, and inline after an
 * admin's "send now" / "test send" so they do not wait for the next tick.
 *
 * Safety properties:
 *   • idempotent — deliveries are unique per run/user/channel/device, and a row
 *     is claimed with SKIP LOCKED before it is sent, so overlapping cycles
 *     cannot double-send;
 *   • a network failure or open breaker puts the batch back to `queued`;
 *   • BROADCAST_DRY_RUN=true records everything but never calls Expo or Resend
 *     — use it on dev, which holds real people's push tokens;
 *   • the `vendor_expo_push` kill switch leaves push rows queued, untouched.
 */

export interface CycleResult {
  dryRun: boolean;
  due: number;
  enqueued: number;
  push: { claimed: number; sent: number; errors: number; requeued: number };
  inApp: { delivered: number };
  email: { sent: number; skipped: number };
  receipts: { checked: number; delivered: number; errors: number };
  runsUpdated: number;
}

export function broadcastDryRun(): boolean {
  return (process.env.BROADCAST_DRY_RUN || '').trim() === 'true';
}

interface ClaimedRow {
  id: number;
  run_id: string;
  broadcast_id: string;
  user_id: string;
  device_id: string | null;
  expo_token: string | null;
  kind: string;
  title: string;
  body: string;
  image_url: string | null;
  deep_link: string | null;
  cta_label: string | null;
  guide_id: string | null;
  in_app_style: string;
  attempts: number;
}

async function claim(admin: SupabaseClient, channel: 'push' | 'in_app' | 'email', limit: number): Promise<ClaimedRow[]> {
  const { data, error } = await (admin.rpc as any)('claim_broadcast_deliveries', {
    p_channel: channel,
    p_limit: limit,
  });
  if (error) {
    logger.error('[broadcasts] claim failed', { channel, err: error });
    return [];
  }
  return (data ?? []) as ClaimedRow[];
}

/** In-app link for a broadcast: explicit deep link, else the guide, else home. */
export function broadcastLink(row: { deep_link: string | null; guide_id: string | null }): string {
  if (row.deep_link) return row.deep_link;
  if (row.guide_id) return `/dashboard?guide=${encodeURIComponent(row.guide_id)}`;
  return '/dashboard/home';
}

async function updateRows(admin: SupabaseClient, ids: number[], patch: Record<string, unknown>) {
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { error } = await admin.from('broadcast_deliveries').update(patch).in('id', chunk);
    if (error) logger.error('[broadcasts] delivery update failed', { err: error, count: chunk.length });
  }
}

async function sendPush(admin: SupabaseClient, dryRun: boolean, limit: number) {
  const out = { claimed: 0, sent: 0, errors: 0, requeued: 0 };
  if (!vendorEnabled('vendor_expo_push') && !dryRun) return out;

  const rows = await claim(admin, 'push', limit);
  out.claimed = rows.length;

  for (let i = 0; i < rows.length; i += EXPO_BATCH) {
    const slice = rows.slice(i, i + EXPO_BATCH);
    const sendable = slice.filter((r) => r.expo_token);
    const orphans = slice.filter((r) => !r.expo_token);

    if (orphans.length) {
      await updateRows(admin, orphans.map((r) => r.id), { status: 'skipped', skip_reason: 'no_device' });
    }
    if (sendable.length === 0) continue;

    const now = new Date().toISOString();
    if (dryRun) {
      await updateRows(admin, sendable.map((r) => r.id), {
        status: 'sent', sent_at: now, expo_ticket_id: 'dry-run', error_code: null, error_message: null,
      });
      out.sent += sendable.length;
      continue;
    }

    const messages: ExpoMessage[] = sendable.map((r) => ({
      to: r.expo_token as string,
      title: r.title,
      body: r.body,
      data: {
        link: broadcastLink(r),
        delivery_id: r.id,
        broadcast_id: r.broadcast_id,
        ...(r.guide_id ? { guide_id: r.guide_id } : {}),
      },
      ...(r.image_url ? { richContent: { image: r.image_url }, mutableContent: true } : {}),
    }));

    let tickets;
    try {
      tickets = await sendExpoBatch(messages, 'expo_push_broadcast');
    } catch (err) {
      logger.warn('[broadcasts] push batch failed, requeueing', { err: String(err), count: sendable.length });
      await updateRows(admin, sendable.map((r) => r.id), { status: 'queued' });
      out.requeued += sendable.length;
      // The breaker is probably open; stop hammering it this cycle.
      break;
    }

    const okIds: { id: number; ticket: string }[] = [];
    for (let j = 0; j < sendable.length; j++) {
      const row = sendable[j];
      const t = tickets[j];
      if (t.status === 'ok' && t.id) {
        okIds.push({ id: row.id, ticket: t.id });
        continue;
      }
      out.errors += 1;
      const code = t.details?.error ?? 'TicketError';
      await admin
        .from('broadcast_deliveries')
        .update({ status: 'error', error_code: code, error_message: (t.message ?? '').slice(0, 300), sent_at: now })
        .eq('id', row.id);
      if (code === 'DeviceNotRegistered' && row.device_id) {
        await admin
          .from('push_devices')
          .update({ disabled_at: now, disabled_reason: 'DeviceNotRegistered' })
          .eq('id', row.device_id);
      }
    }
    // Ticket ids differ per row, so these are individual updates — batched in
    // parallel groups to keep a 500-row cycle quick.
    for (let k = 0; k < okIds.length; k += 25) {
      await Promise.all(
        okIds.slice(k, k + 25).map(({ id, ticket }) =>
          admin
            .from('broadcast_deliveries')
            .update({ status: 'sent', sent_at: now, expo_ticket_id: ticket, error_code: null, error_message: null })
            .eq('id', id),
        ),
      );
    }
    out.sent += okIds.length;
  }
  return out;
}

async function sendInApp(admin: SupabaseClient, limit: number) {
  const rows = await claim(admin, 'in_app', limit);
  let delivered = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from('notifications').insert(
      chunk.map((r) => ({
        user_id: r.user_id,
        type: 'announcement',
        title: r.title,
        body: r.body,
        link: broadcastLink(r),
      })),
    );
    const now = new Date().toISOString();
    if (error) {
      logger.error('[broadcasts] in-app insert failed', { err: error });
      await updateRows(admin, chunk.map((r) => r.id), { status: 'queued' });
      continue;
    }
    await updateRows(admin, chunk.map((r) => r.id), { status: 'delivered', sent_at: now, delivered_at: now });
    delivered += chunk.length;
  }
  return { delivered };
}

async function sendEmail(admin: SupabaseClient, dryRun: boolean, limit: number) {
  const out = { sent: 0, skipped: 0 };
  const rows = await claim(admin, 'email', limit);
  for (const r of rows) {
    const now = new Date().toISOString();
    if (dryRun) {
      await admin.from('broadcast_deliveries').update({ status: 'sent', sent_at: now, error_code: 'dry-run' }).eq('id', r.id);
      out.sent += 1;
      continue;
    }
    const result = await deliverEmail({
      userId: r.user_id,
      templateId: 'generic',
      data: { title: r.title, body: r.body, link: broadcastLink(r), ctaLabel: r.cta_label || 'Open Influnet' },
      dedupeKey: `broadcast:${r.run_id}:${r.user_id}`,
      // System/reminder mail is account mail; everything else is marketing and
      // obeys the marketing opt-out + unsubscribe link.
      categoryOverride: r.kind === 'system' ? 'account' : r.kind === 'reminder' ? 'payment' : 'marketing',
    });
    if (result.sent) {
      await admin.from('broadcast_deliveries').update({ status: 'sent', sent_at: now }).eq('id', r.id);
      out.sent += 1;
    } else if (result.reason === 'send_failed' && r.attempts < 3) {
      await admin.from('broadcast_deliveries').update({ status: 'queued', error_message: result.detail ?? null }).eq('id', r.id);
    } else {
      await admin
        .from('broadcast_deliveries')
        .update({ status: 'skipped', skip_reason: `email_${result.reason}` })
        .eq('id', r.id);
      out.skipped += 1;
    }
  }
  return out;
}

/** Confirms delivery for push tickets older than 15 minutes (Expo's guidance). */
export async function pollReceipts(admin: SupabaseClient) {
  const out = { checked: 0, delivered: 0, errors: 0 };
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const until = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await admin
    .from('broadcast_deliveries')
    .select('id, expo_ticket_id, device_id')
    .eq('channel', 'push')
    .eq('status', 'sent')
    .not('expo_ticket_id', 'is', null)
    .neq('expo_ticket_id', 'dry-run')
    .gte('sent_at', since)
    .lte('sent_at', until)
    .limit(EXPO_RECEIPT_BATCH);
  if (error || !data?.length) return out;

  let receipts: Record<string, { status: string; message?: string; details?: { error?: string } }>;
  try {
    receipts = await getExpoReceipts(data.map((d) => d.expo_ticket_id as string));
  } catch (err) {
    logger.warn('[broadcasts] receipts poll failed', { err: String(err) });
    return out;
  }

  const now = new Date().toISOString();
  const deliveredIds: number[] = [];
  for (const row of data) {
    const r = receipts[row.expo_ticket_id as string];
    if (!r) continue;
    out.checked += 1;
    if (r.status === 'ok') {
      deliveredIds.push(row.id as number);
      continue;
    }
    out.errors += 1;
    const code = r.details?.error ?? 'ReceiptError';
    await admin
      .from('broadcast_deliveries')
      .update({ status: 'error', error_code: code, error_message: (r.message ?? '').slice(0, 300) })
      .eq('id', row.id);
    if (code === 'DeviceNotRegistered' && row.device_id) {
      await admin.from('push_devices').update({ disabled_at: now, disabled_reason: 'DeviceNotRegistered' }).eq('id', row.device_id);
    }
  }
  await updateRows(admin, deliveredIds, { status: 'delivered', delivered_at: now });
  out.delivered = deliveredIds.length;
  return out;
}

export async function runBroadcastCycle(
  admin: SupabaseClient,
  opts: { skipDue?: boolean; skipReceipts?: boolean; pushLimit?: number; inAppLimit?: number; emailLimit?: number } = {},
): Promise<CycleResult> {
  const dryRun = broadcastDryRun();
  const result: CycleResult = {
    dryRun,
    due: 0,
    enqueued: 0,
    push: { claimed: 0, sent: 0, errors: 0, requeued: 0 },
    inApp: { delivered: 0 },
    email: { sent: 0, skipped: 0 },
    receipts: { checked: 0, delivered: 0, errors: 0 },
    runsUpdated: 0,
  };

  if (!opts.skipDue) {
    const { data: due, error } = await (admin.rpc as any)('due_broadcasts');
    if (error) {
      logger.error('[broadcasts] due_broadcasts failed', { err: error });
    } else {
      result.due = (due ?? []).length;
      for (const d of (due ?? []) as { broadcast_id: string; scheduled_for: string }[]) {
        const { data: run, error: enqErr } = await (admin.rpc as any)('enqueue_broadcast_run', {
          p_broadcast_id: d.broadcast_id,
          p_scheduled_for: d.scheduled_for,
          p_test_user: null,
        });
        if (enqErr) logger.error('[broadcasts] enqueue failed', { broadcast: d.broadcast_id, err: enqErr });
        else if (run?.created) result.enqueued += 1;
      }
    }
  }

  result.push = await sendPush(admin, dryRun, opts.pushLimit ?? 1000);
  result.inApp = await sendInApp(admin, opts.inAppLimit ?? 5000);
  result.email = await sendEmail(admin, dryRun, opts.emailLimit ?? 100);
  if (!opts.skipReceipts && !dryRun) result.receipts = await pollReceipts(admin);

  const { data: n } = await (admin.rpc as any)('finalize_broadcast_runs');
  result.runsUpdated = typeof n === 'number' ? n : 0;

  logger.info('[broadcasts] cycle complete', result as unknown as Record<string, unknown>);
  return result;
}
