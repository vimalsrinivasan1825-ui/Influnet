import { fetchWithTimeout, TIMEOUT } from './fetch-timeout';
import { withBreaker } from './circuit-breaker';

/**
 * Thin Expo push API client shared by notifyUser() (transactional, one user)
 * and the broadcast sender (bulk).
 *
 * Expo answers 200 even when it refuses a message — the verdict is in the
 * per-message TICKET. Delivery is only confirmed later by a RECEIPT, polled with
 * the ticket id (see pollReceipts in lib/broadcasts.ts).
 *
 * Breaker keys are separate on purpose: a 50k promotional broadcast tripping
 * the breaker must not stop stage-change pushes (`expo_push`), so bulk sends use
 * `expo_push_broadcast`.
 */

export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo accepts at most 100 messages per send request. */
export const EXPO_BATCH = 100;
/** …and at most 1000 ids per receipts request. */
export const EXPO_RECEIPT_BATCH = 1000;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  /** Android big picture / iOS (with a notification service extension). */
  richContent?: { image?: string };
  mutableContent?: boolean;
}

export interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Defaults every Influnet push carries (see apps/mobile/lib/push.ts). */
export function withDefaults(m: ExpoMessage): ExpoMessage {
  return {
    sound: 'default',
    // Android routes by channel; 'default' is created at MAX importance by the
    // app. `priority: high` lets the message wake a dozing device.
    channelId: 'default',
    priority: 'high',
    ...m,
  };
}

/**
 * Sends up to EXPO_BATCH messages in one request. Returns one ticket per
 * message in order, or throws (network, non-2xx, breaker open) so the caller
 * can leave the rows queued for a retry.
 */
export async function sendExpoBatch(
  messages: ExpoMessage[],
  breakerKey: 'expo_push' | 'expo_push_broadcast' = 'expo_push',
): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  if (messages.length > EXPO_BATCH) throw new Error(`sendExpoBatch: max ${EXPO_BATCH} messages`);

  const res = await withBreaker(breakerKey, () =>
    fetchWithTimeout(EXPO_SEND_URL, {
      timeoutMs: TIMEOUT.PUSH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.map(withDefaults)),
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push send failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] | ExpoTicket } | null;
  const data = json?.data;
  const tickets = Array.isArray(data) ? data : data ? [data] : [];
  // Pad defensively so indexes always line up with the messages sent.
  while (tickets.length < messages.length) {
    tickets.push({ status: 'error', message: 'No ticket returned', details: { error: 'NoTicket' } });
  }
  return tickets;
}

export async function getExpoReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  if (ids.length === 0) return {};
  const res = await withBreaker('expo_push_broadcast', () =>
    fetchWithTimeout(EXPO_RECEIPTS_URL, {
      timeoutMs: TIMEOUT.PUSH,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: ids.slice(0, EXPO_RECEIPT_BATCH) }),
    }),
  );
  if (!res.ok) throw new Error(`Expo receipts failed: ${res.status}`);
  const json = (await res.json().catch(() => null)) as { data?: Record<string, ExpoReceipt> } | null;
  return json?.data ?? {};
}
