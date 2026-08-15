/**
 * Stream Chat connection for the app.
 *
 * The web dashboard's chat is GetStream, not the Supabase `messages` table —
 * `<Chat client={streamClient}>` in apps/web/src/app/dashboard/messages/page.tsx
 * is the whole messaging surface. Mobile was reading /api/conversations/:id/
 * messages, which only ever held the pre-Stream rows, so anything sent from web
 * was invisible here. This module puts mobile on the same backend.
 *
 * Only the plain `stream-chat` JS client is used — no Stream UI kit. The client
 * is pure JS and runs fine on Hermes, and it leaves the message list, composer
 * and bubbles as ours rather than importing a second design system.
 *
 * Auth mirrors web exactly: the token comes from /api/stream/token (signed
 * server-side with the secret, which never reaches the device) and channels are
 * created by /api/stream/channel, which enforces that the caller is actually a
 * participant.
 */
import { StreamChat } from 'stream-chat';
import Constants from 'expo-constants';
import { endpoints } from './api';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const sanitize = (val?: string) => (val ?? '').replace(/[\r\n\s]+/g, '');

/**
 * Publishable key — the same value web ships to the browser as
 * NEXT_PUBLIC_STREAM_API_KEY. Safe on the client; the secret stays server-side.
 */
export const STREAM_API_KEY =
  sanitize(process.env.EXPO_PUBLIC_STREAM_API_KEY ?? extra.streamApiKey);

let client: StreamChat | null = null;
/** In-flight connect, so concurrent screens share one handshake. */
let connecting: Promise<StreamChat | null> | null = null;
let connectedUserId: string | null = null;

/**
 * Why a connect attempt failed, so the UI can say something more useful than
 * a single generic "couldn't connect" — the screenshot that prompted this
 * (2026-08-04) showed that message for what was actually a server-side token
 * failure, indistinguishable from a dropped WebSocket or no network at all.
 */
export type StreamFailureReason = 'not_configured' | 'token_failed' | 'handshake_failed' | 'channel_failed';
/** Set by the most recent failed connect/channel attempt; read right after a null return. */
let lastFailureReason: StreamFailureReason | null = null;
export function getLastStreamFailureReason(): StreamFailureReason | null {
  return lastFailureReason;
}

export function isStreamConfigured() {
  return STREAM_API_KEY.length > 0;
}

/**
 * Neither the token fetch nor `connectUser`'s WebSocket handshake had a
 * timeout. A wrong app/key pair used to be the only way to hang here, and
 * that always looked the same from the UI: "Connecting…" forever, no error,
 * no way to tell a real bug apart from a slow network. Backend and
 * credentials are now verified correct end to end (2026-08-04), so a bad WS
 * handshake — flaky connectivity, a captive portal, GetStream's edge being
 * briefly unreachable from this device's network — is the remaining
 * candidate, and it deserves a visible, retryable failure instead of a
 * silent hang.
 */
const CONNECT_TIMEOUT_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Connect the signed-in user, reusing the existing connection when there is one.
 *
 * Returns null rather than throwing when Stream isn't configured, the token
 * call fails, or the handshake times out — chat then degrades to an
 * explanatory, retryable empty state instead of hanging the conversation
 * screen indefinitely with no feedback.
 */
export async function getStreamClient(): Promise<StreamChat | null> {
  if (!isStreamConfigured()) {
    lastFailureReason = 'not_configured';
    return null;
  }
  if (client && connectedUserId) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    let res;
    try {
      res = await withTimeout(endpoints.streamToken<{ token: string; userId: string; name?: string }>(), CONNECT_TIMEOUT_MS, 'stream token fetch');
    } catch (err) {
      lastFailureReason = 'token_failed';
      if (__DEV__) console.warn('[stream] token fetch failed:', err);
      return null;
    }
    if (!res.ok || !res.data?.token) {
      // A 401/403/500 from /api/stream/token — most commonly the server is
      // missing or has a stale STREAM_API_SECRET, not a network problem on
      // this device. Surfacing res.error in dev makes that distinguishable
      // from a real handshake/network failure below.
      lastFailureReason = 'token_failed';
      if (__DEV__) console.warn('[stream] token response not ok:', res.status, res.error);
      return null;
    }

    const { token, userId, name } = res.data;
    const instance = StreamChat.getInstance(STREAM_API_KEY);

    // A hot reload can leave a stale connection behind under a different id.
    if (instance.userID && instance.userID !== userId) {
      await instance.disconnectUser().catch(() => {});
    }

    if (!instance.userID) {
      try {
        await withTimeout(
          instance.connectUser({ id: userId, name: name || undefined }, token),
          CONNECT_TIMEOUT_MS,
          'stream connectUser',
        );
      } catch (err) {
        // The SDK may have half-completed the handshake before the timeout
        // fired. Reset it so the NEXT attempt (pull-to-refresh, reopening
        // the screen) starts from a clean slate instead of inheriting a
        // socket stuck between connected and not.
        await instance.disconnectUser().catch(() => {});
        lastFailureReason = 'handshake_failed';
        if (__DEV__) console.warn('[stream] connect failed:', err);
        return null;
      }
    }

    client = instance;
    connectedUserId = userId;
    lastFailureReason = null;
    return instance;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * The channel backing a conversation.
 *
 * /api/stream/channel is called first so the channel exists and both members
 * are registered under their real names — creating it client-side would skip
 * the participant check that route performs.
 */
export async function getConversationChannel(conversationId: string, otherUserId: string) {
  const instance = await getStreamClient();
  if (!instance) return null;

  let ensured;
  try {
    ensured = await withTimeout(
      endpoints.streamChannel({ conversationId, otherUserId }),
      CONNECT_TIMEOUT_MS,
      'stream channel ensure',
    );
  } catch (err) {
    lastFailureReason = 'channel_failed';
    if (__DEV__) console.warn('[stream] channel ensure failed:', err);
    return null;
  }
  if (!ensured.ok) {
    lastFailureReason = 'channel_failed';
    if (__DEV__) console.warn('[stream] channel ensure not ok:', ensured.status, ensured.error);
    return null;
  }

  // Channel ids are `conv_<conversation uuid>` — see ensureStreamChannel in
  // apps/web/src/lib/stream.ts. This must stay in step with that.
  const channel = instance.channel('messaging', `conv_${conversationId}`);
  try {
    await withTimeout(channel.watch(), CONNECT_TIMEOUT_MS, 'stream channel watch');
  } catch (err) {
    lastFailureReason = 'channel_failed';
    if (__DEV__) console.warn('[stream] channel watch failed:', err);
    return null;
  }
  lastFailureReason = null;
  return channel;
}

/** Drop the connection on sign-out so the next account doesn't inherit it. */
export async function disconnectStream() {
  if (!client) return;
  await client.disconnectUser().catch(() => {});
  client = null;
  connectedUserId = null;
}
