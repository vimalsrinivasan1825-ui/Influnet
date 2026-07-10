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
