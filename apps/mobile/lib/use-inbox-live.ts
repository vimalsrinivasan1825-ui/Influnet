/**
 * Per-thread unread counts and who is online, straight from Stream.
 *
 * ── WHY THE INBOX NEEDS ITS OWN SOURCE ────────────────────────────────
 *
 * /api/conversations answers "who and what was last said", and it is the right
 * source for that. It cannot answer either of the two questions an inbox row
 * most needs:
 *
 *   How many have I not read?  The Postgres `messages` table is pre-Stream
 *                              history (see the chat notes in AGENTS.md); live
 *                              messages are Stream channel events and never
 *                              land there. The endpoint's newest-message embed
 *                              can only tell us WHO spoke last, which is one
 *                              bit — enough to bold a row, not enough to say
 *                              "3".
 *   Are they online?           Nothing in Postgres knows. Presence is a
 *                              websocket fact and expires the moment the
 *                              socket does.
 *
 * Stream owns both, so this hook asks Stream — once per mount, then keeps the
 * answer live off the same socket the chat screen already uses.
 *
 * ── IT IS ADDITIVE, NEVER LOAD-BEARING ────────────────────────────────
 *
 * Every failure path returns an empty map and the inbox renders exactly as it
 * did before: names, previews, timestamps, and the from-them bit for bolding.
 * Stream is unconfigured in some environments and simply down in others, and
 * neither should cost anyone their message list. Nothing here throws, and
 * nothing here blocks the list's own fetch.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, Event, StreamChat } from 'stream-chat';
import { getStreamClient, isStreamConfigured } from '@/lib/stream';

export interface InboxLiveRow {
  /** Messages in this thread the signed-in user has not read. */
  unread: number;
  /** True when the other participant currently holds a socket. */
  online: boolean;
}

/** conversationId → live state. Absent means "we don't know", never "zero". */
export type InboxLive = Map<string, InboxLiveRow>;

/**
 * Channel ids are `conv_<conversation uuid>` — set by ensureStreamChannel in
 * apps/web/src/lib/stream.ts and mirrored in lib/stream.ts. This must stay in
 * step with both.
 */
const CHANNEL_PREFIX = 'conv_';

/**
 * How many threads to track.
 *
 * Deliberately finite. Someone with hundreds of conversations does not need
 * presence on the ones they have not opened in a year, and `queryChannels`
 * with `presence: true` subscribes to every member it returns — an unbounded
 * query would open a lot of subscriptions to answer a question about rows that
 * are not on screen.
 */
const CHANNEL_LIMIT = 40;

export function useInboxLive(enabled = true): InboxLive {
  const [live, setLive] = useState<InboxLive>(new Map());

  // The channels this hook is tracking, kept in a ref because the event
  // handler reads them and re-rendering on every keystroke of activity would
  // be both useless and expensive.
  const channelsRef = useRef<Channel[]>([]);
  const clientRef = useRef<StreamChat | null>(null);

  const recompute = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;

    const next: InboxLive = new Map();
    for (const channel of channelsRef.current) {
      const id = channel.id;
      if (!id || !id.startsWith(CHANNEL_PREFIX)) continue;

      // Everyone in the channel who is not us. A conversation is always two
      // people here, so this is one member — but reading it as a list means a
      // group channel would degrade to "someone is online" rather than crash.
      const others = Object.values(channel.state.members).filter(
        (m) => m.user?.id && m.user.id !== client.userID,
      );

      next.set(id.slice(CHANNEL_PREFIX.length), {
        unread: channel.countUnread(),
        online: others.some((m) => m.user?.online === true),
      });
    }
    setLive(next);
  }, []);

  useEffect(() => {
    if (!enabled || !isStreamConfigured()) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const client = await getStreamClient();
      // Unconfigured, token failure, handshake timeout — all of them mean the
      // inbox shows what it always showed. See the note at the top.
      if (!client || cancelled) return;
      clientRef.current = client;

      let channels: Channel[];
      try {
        channels = await client.queryChannels(
          { type: 'messaging', members: { $in: [client.userID!] } },
          // Newest activity first, so the truncation at CHANNEL_LIMIT drops the
          // threads least likely to be on screen.
          [{ last_message_at: -1 }],
          // `state` populates the read counts; `presence` is what makes
          // `user.online` meaningful and subscribes us to its changes.
          { watch: true, state: true, presence: true, limit: CHANNEL_LIMIT },
        );
      } catch {
        // A failed query is not an error the user can do anything about, and
        // the list behind this is already on screen.
        return;
      }
      if (cancelled) return;

      channelsRef.current = channels;
      recompute();

      /**
       * Everything that can change either number.
       *
       * `message.new` and `notification.message_new` cover a message arriving
       * in a watched and an unwatched channel respectively; `mark_read` covers
       * reading one anywhere, including on another device; the presence and
       * membership events cover the dot. Recomputing the whole map on each is
       * fine at forty channels and avoids the class of bug where one event type
       * updates a count and another silently does not.
       */
      const events = [
        'message.new',
        'notification.message_new',
        'notification.mark_read',
        'message.read',
        'user.presence.changed',
        'user.watching.start',
        'user.watching.stop',
      ] as const;

      const handlers = events.map((event) =>
        client.on(event, (_e: Event) => {
          if (!cancelled) recompute();
        }),
      );

      unsubscribe = () => handlers.forEach((h) => h.unsubscribe());
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      // The client itself is shared and deliberately NOT disconnected here —
      // lib/session.ts owns its lifecycle and tears it down on sign-out, while
      // the token is still valid. Disconnecting on unmount would drop the chat
      // screen's socket every time someone left the inbox.
      channelsRef.current = [];
      clientRef.current = null;
    };
  }, [enabled, recompute]);

  return live;
}
