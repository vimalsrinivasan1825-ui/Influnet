import { StreamChat } from 'stream-chat';
import { vendorEnabled } from './feature-flags';
import { withBreaker } from './circuit-breaker';

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
  if (!vendorEnabled('vendor_stream')) {
    throw new Error('Chat is temporarily unavailable');
  }
  return withBreaker('stream', () => ensureStreamUserRequest(userId, name));
}

async function ensureStreamUserRequest(userId: string, name?: string | null) {
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

export type StreamRemoval = { ok: true; skipped?: string } | { ok: false; error: string };

/**
 * Remove a deleted account from Stream Chat (account deletion, self-service
 * and admin). Without this the person's name, avatar and every message they
 * sent stay on Stream's servers after the account is gone.
 *
 * Their messages are hard-deleted with them. Channels are NOT deleted here:
 * a 1:1 channel is also the OTHER person's copy of the conversation, so it
 * stays until nobody is left in it (see deleteStreamChannels).
 *
 * Never throws — callers decide what a failure means. Account deletion logs it
 * and carries on, because a Stream outage must not stop anyone deleting their
 * account (both app stores require that to work).
 */
export async function deleteStreamUser(userId: string): Promise<StreamRemoval> {
  if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET) {
    return { ok: true, skipped: 'Stream is not configured in this environment' };
  }
  if (!vendorEnabled('vendor_stream')) {
    return { ok: false, error: 'Stream is switched off (vendor_stream), so the chat user was not removed' };
  }
  try {
    await withBreaker('stream', () =>
      getStreamClient().deleteUser(userId, { mark_messages_deleted: true, hard_delete: true }),
    );
    return { ok: true };
  } catch (e: unknown) {
    const err = e as { message?: string; code?: number; status?: number };
    // Stream answers 400/404 "user not found" for someone who never opened chat.
    if (err?.status === 404 || err?.code === 16 || /not\s*found|does not exist/i.test(err?.message ?? '')) {
      return { ok: true, skipped: 'no Stream user existed' };
    }
    return { ok: false, error: err?.message ?? 'Stream deleteUser failed' };
  }
}

/**
 * Delete the Stream channels of conversations that no longer have ANY
 * participant in our database (both people gone). Best-effort, like
 * deleteStreamUser; returns how many were removed.
 */
export async function deleteStreamChannels(conversationIds: string[]): Promise<{ deleted: number; error?: string }> {
  if (conversationIds.length === 0) return { deleted: 0 };
  if (!process.env.STREAM_API_KEY || !process.env.STREAM_API_SECRET || !vendorEnabled('vendor_stream')) {
    return { deleted: 0 };
  }
  let deleted = 0;
  let firstError: string | undefined;
  for (const id of conversationIds) {
    try {
      await withBreaker('stream', () =>
        getStreamClient().channel('messaging', `conv_${id}`).delete({ hard_delete: true }),
      );
      deleted++;
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number };
      if (err?.status === 404 || /not\s*found|does not exist/i.test(err?.message ?? '')) continue;
      firstError ??= err?.message ?? 'channel delete failed';
    }
  }
  return firstError ? { deleted, error: firstError } : { deleted };
}
