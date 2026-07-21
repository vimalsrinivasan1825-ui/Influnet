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

/**
 * Publishable key — the same value web ships to the browser as
 * NEXT_PUBLIC_STREAM_API_KEY. Safe on the client; the secret stays server-side.
 */
export const STREAM_API_KEY =
  process.env.EXPO_PUBLIC_STREAM_API_KEY ?? extra.streamApiKey ?? '';

let client: StreamChat | null = null;
/** In-flight connect, so concurrent screens share one handshake. */
let connecting: Promise<StreamChat | null> | null = null;
let connectedUserId: string | null = null;

export function isStreamConfigured() {
  return STREAM_API_KEY.length > 0;
}

/**
 * Connect the signed-in user, reusing the existing connection when there is one.
 *
 * Returns null rather than throwing when Stream isn't configured or the token
 * call fails — chat then degrades to an explanatory empty state instead of
 * taking the conversation screen down with it.
 */
export async function getStreamClient(): Promise<StreamChat | null> {
  if (!isStreamConfigured()) return null;
  if (client && connectedUserId) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const res = await endpoints.streamToken<{ token: string; userId: string; name?: string }>();
    if (!res.ok || !res.data?.token) return null;

    const { token, userId, name } = res.data;
    const instance = StreamChat.getInstance(STREAM_API_KEY);

    // A hot reload can leave a stale connection behind under a different id.
    if (instance.userID && instance.userID !== userId) {
      await instance.disconnectUser().catch(() => {});
    }

    if (!instance.userID) {
      await instance.connectUser({ id: userId, name: name || undefined }, token);
    }

    client = instance;
    connectedUserId = userId;
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

  const ensured = await endpoints.streamChannel({ conversationId, otherUserId });
  if (!ensured.ok) return null;

  // Channel ids are `conv_<conversation uuid>` — see ensureStreamChannel in
  // apps/web/src/lib/stream.ts. This must stay in step with that.
  const channel = instance.channel('messaging', `conv_${conversationId}`);
  await channel.watch();
  return channel;
}

/** Drop the connection on sign-out so the next account doesn't inherit it. */
export async function disconnectStream() {
  if (!client) return;
  await client.disconnectUser().catch(() => {});
  client = null;
  connectedUserId = null;
}
