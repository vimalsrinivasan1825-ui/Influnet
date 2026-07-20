import { StreamChat } from 'stream-chat';

let serverClient: StreamChat | null = null;

export function getStreamClient(): StreamChat {
  if (serverClient) return serverClient;

  const apiKey = process.env.STREAM_API_KEY;
  const apiSecret = process.env.STREAM_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('Missing Stream Chat credentials (STREAM_API_KEY / STREAM_API_SECRET)');
  }

  serverClient = StreamChat.getInstance(apiKey, apiSecret);
  return serverClient;
}

/**
 * Upsert a user into Stream Chat and return a token.
 * Call this server-side when a user needs to chat.
 */
export async function ensureStreamUser(userId: string, name?: string | null) {
  const client = getStreamClient();

  // Never overwrite a good display name with the raw UUID. Callers that don't
  // know the name should leave the existing record alone rather than clobber
  // it — that is how accounts ended up showing an id (or a stale name) as
  // their sender label.
  if (!name) {
    const existing = await client.queryUsers({ id: userId }).catch(() => null);
    if (existing?.users?.length) return { token: client.createToken(userId), userId };
  }

  await client.upsertUser({
    id: userId,
    name: name || userId,
  });

  const token = client.createToken(userId);
  return { token, userId };
}

/**
 * Create or get a Stream channel for a conversation between two users.
 * The channel ID is prefixed with 'conv_' + the DB conversation UUID.
 */
export async function ensureStreamChannel(
  conversationId: string,
  memberIds: string[],
  /**
   * Shared channel title. MUST be viewer-independent — a project title, never a
   * person's name.
   *
   * A channel has ONE name that both members see. Passing "the other person's
   * name" meant whoever opened the chat last overwrote it with their own view,
   * so the other party then saw THEIR OWN name in the header. For a 1:1
   * conversation leave this undefined: the header is rendered from our own
   * data, per viewer.
   */
  channelName?: string,
) {
  const client = getStreamClient();
  const channelId = `conv_${conversationId}`;

  const channel = client.channel('messaging', channelId, {
    members: memberIds,
    created_by_id: memberIds[0],
  } as any);

  await channel.create();
  if (channelName) {
    await (channel as any).updatePartial({ set: { name: channelName } });
  }
  return channel;
}
