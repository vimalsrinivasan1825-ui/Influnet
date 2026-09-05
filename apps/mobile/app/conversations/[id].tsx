import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import {
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  CornerUpLeft,
  FileText,
  Handshake,
  Image as ImageIcon,
  MoreVertical,
  Paperclip,
  SendHorizontal,
  X,
} from 'lucide-react-native';
import type { Channel, LocalMessage, MessageResponse, ReactionResponse } from 'stream-chat';
import type { Message } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { getConversationChannel, getLastStreamFailureReason, isStreamConfigured } from '@/lib/stream';
import { useNotificationSummary } from '@/lib/notification-summary';
import { useNotificationToast } from '@/lib/notification-toast';
import { formatCurrency, formatDayLabel, formatMessageTime, timeAgo } from '@/lib/format';
import {
  TEXT_SCALE as TEXT_SCALE_PREVIEW,
  TEXT_SIZE_LABEL,
  useChatDisplay,
  type ChatTextSize,
} from '@/lib/use-chat-display';
import { ChatPaper } from '@/components/chat-paper';
import { dealStateOf, DEAL_STATE_LABEL, flowOf } from '@influnet/core';

/**
 * " · Step 2 of 12", or nothing.
 *
 * Nothing when the backend did not send a stage, and nothing when the stage is
 * one this build does not know — a strip or a counter that cannot place the
 * project must say less, not guess. The denominator comes from the project's
 * own flow: the short flows have four stages, and reporting a finished short
 * project as "step 4 of 12" would be worse than saying nothing at all.
 */
function stageLine(stage: string | null, flowKey: string | null): string {
  if (!stage) return '';
  const flow = flowOf({ flow_key: flowKey });
  const index = flow.stages.indexOf(stage);
  if (index < 0) return '';
  return ` · Step ${index + 1} of ${flow.stages.length}`;
}

/** Stream hands back slightly different message types by call site. */
type StreamMessage = MessageResponse | LocalMessage;
import {
  Badge,
  Button,
  Card,
  Field,
  KeyboardAvoider,
  Sheet,
  Txt,
  VerifiedBadge,
  type SheetRef,
} from '@/components/ui';

/**
 * Same six types (and same emoji) as the web dashboard's default reaction bar
 * — see `defaultReactionOptions` in stream-chat-react. Keeping the type
 * strings identical means a reaction added on one platform renders correctly
 * on the other; inventing our own set would have shown up as a blank/unknown
 * reaction on web.
 */
const REACTIONS: { type: string; emoji: string }[] = [
  { type: 'like', emoji: '👍' },
  { type: 'love', emoji: '❤️' },
  { type: 'haha', emoji: '😂' },
  { type: 'wow', emoji: '😮' },
  { type: 'sad', emoji: '😔' },
  { type: 'fire', emoji: '🔥' },
];
const REACTION_EMOJI = new Map(REACTIONS.map((r) => [r.type, r.emoji]));

/**
 * As /api/conversations/[id]/deal actually sends it.
 *
 * There is no `deal` key: the route reports the negotiation as its separate
 * moving parts — a pending `proposal`, a `legacy_pending` project awaiting
 * acceptance, the live `projects`, and a `viewer` block of permissions. Reading
 * a `deal` object meant this card never appeared at all.
 */
interface DealPayload {
  /** The person on the other end — needed to open the Stream channel. */
  other_user_id?: string | null;
  partner?: { id: string; name?: string | null; role?: string | null; verified_badge?: boolean | null } | null;
  request?: { id: string; status: string } | null;
  projects?: {
    id: string;
    title: string;
    budget: number | null;
    status: string;
    /** Both absent on an older backend; the banner falls back to a status line. */
    current_stage?: string | null;
    flow_key?: string | null;
  }[];
  proposal?: {
    id: string;
    title: string;
    description: string | null;
    budget: number | null;
    proposed_by: string;
  } | null;
  legacy_pending?: { id: string; title: string; budget: number | null } | null;
  viewer?: {
    awaiting_me?: boolean;
    can_respond_to_proposal?: boolean;
    can_withdraw_proposal?: boolean;
    /** Terms can go out: they've agreed to talk, nothing pending, no live project. */
    can_propose?: boolean;
  };
}

/** An image or file riding on a message — Stream's own attachment shape. */
interface ChatAttachment {
  type: string;
  image_url?: string;
  asset_url?: string;
  title?: string;
  file_size?: number;
  mime_type?: string;
}

/** One reaction type on a message, folded down to what the bubble needs. */
interface ChatReaction {
  type: string;
  count: number;
  mine: boolean;
}

/** The message this one is quoting — a WhatsApp-style reply-to. */
interface QuotedMessage {
  id: string;
  body: string;
  sender_user_id: string;
}

/**
 * One bubble, whichever backend it came from.
 *
 * Postgres holds the pre-Stream history and Stream holds everything since, so
 * the list renders a single normalised shape rather than branching per source.
 * Legacy Postgres rows never carry attachments, reactions or a quote — those
 * only exist once Stream is the source.
 */
interface ChatMessage {
  id: string;
  body: string;
  sender_user_id: string;
  created_at: string;
  deleted: boolean;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  quoted: QuotedMessage | null;
}

function fromPostgres(m: Message): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    sender_user_id: m.sender_user_id,
    created_at: m.created_at,
    deleted: !!m.deleted,
    attachments: [],
    reactions: [],
    quoted: null,
  };
}

/** Reaction counts + who reacted, folded into one list the bubble can map over. */
function reactionsFromStream(m: StreamMessage): ChatReaction[] {
  const counts = (m.reaction_counts ?? {}) as Record<string, number>;
  const mine = new Set(
    ((m.own_reactions ?? []) as ReactionResponse[]).map((r) => r.type)
  );
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type, count, mine: mine.has(type) }));
}

function fromStream(m: StreamMessage): ChatMessage {
  const at = m.created_at;
  const quoted = m.quoted_message;
  return {
    id: m.id,
    body: m.text ?? '',
    sender_user_id: m.user?.id ?? '',
    created_at: at instanceof Date ? at.toISOString() : (at ?? new Date().toISOString()),
    deleted: !!m.deleted_at || m.type === 'deleted',
    attachments: ((m.attachments ?? []) as ChatAttachment[]).filter(
      (a) => a.type === 'image' || a.type === 'file'
    ),
    reactions: reactionsFromStream(m),
    quoted: quoted
      ? { id: quoted.id, body: quoted.text ?? '', sender_user_id: quoted.user?.id ?? '' }
      : null,
  };
}

/**
 * Tell Stream — and our own notification rows — that this thread has been read.
 *
 * `channel.watch()` does NOT do this. Subscribing to a channel and reading it
 * are different things to Stream, so without an explicit markRead() a user's
 * `last_read` never moves: the unread count that feeds the Messages tab badge
 * climbed forever and never came back down, no matter how many times the thread
 * was opened. (It sat frozen at one date for three days.)
 *
 * The notification rows are cleared alongside it because a `type: 'message'`
 * notification is about a message you have now read — leaving those unread
 * meant the bell kept its own parallel, permanently-stale message count.
 */
async function markConversationRead(channel: Channel): Promise<void> {
  try {
    await channel.markRead();
  } catch (err) {
    // Never let a read receipt break the thread you are trying to read.
    console.warn('[chat] could not mark channel read:', err);
  }
  try {
    await endpoints.markConversationNotificationsRead(channel.id?.replace('conv_', '') ?? '');
  } catch (err) {
    console.warn('[chat] could not clear message notifications:', err);
  }
}

/**
 * Legacy history then live messages, in time order.
 *
 * They DO overlap: the webhook in apps/web/src/app/api/stream/webhook/route.ts
 * mirrors every Stream message into the same `messages` table under a FRESH
 * uuid, so id-based dedup can never catch the mirrored twin — every message
 * rendered twice. Stream owns everything from its own oldest message onward;
 * Postgres rows are kept only from strictly before that point, which is
 * exactly the pre-Stream history and nothing the webhook has touched. A 60s
 * margin absorbs clock skew between Stream's and Postgres's clocks. When
 * `live` is empty (Stream unreachable) the cutoff is +Infinity, so the legacy
 * thread still renders in full rather than going blank.
 */
function mergeMessages(legacy: ChatMessage[], live: ChatMessage[]): ChatMessage[] {
  const cutoff = live.length
    ? Math.min(...live.map((m) => new Date(m.created_at).getTime())) - 60_000
    : Infinity;

  const byId = new Map<string, ChatMessage>();
  for (const m of legacy) {
    if (new Date(m.created_at).getTime() < cutoff) byId.set(m.id, m);
  }
  for (const m of live) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/** A day separator or a message, flattened into one list for the FlatList. */
type ListItem =
  | { kind: 'separator'; id: string; label: string }
  | { kind: 'message'; id: string; message: ChatMessage };

/** Inserts a day-label pill before the first message of each calendar day. */
function withDaySeparators(messages: ChatMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const day = m.created_at.slice(0, 10);
    if (day !== lastDay) {
      items.push({ kind: 'separator', id: `sep-${day}`, label: formatDayLabel(m.created_at) });
      lastDay = day;
    }
    items.push({ kind: 'message', id: m.id, message: m });
  }
  return items;
}

/** What the card renders — folded down from the parts above. */
interface DealSummary {
  status: string;
  budget: number | null;
  deliverables: string | null;
  projectId: string | null;
  /** True when the other side has put something to you. */
  awaitingMe: boolean;
  /**
   * Set only when `proposal` is the live thing on the table — the one case
   * this screen can act on directly (accept / decline / withdraw). Legacy
   * pending projects and live projects are informational only here.
   */
  proposalId: string | null;
  canRespond: boolean;
  canWithdraw: boolean;
  /** True when this side may put fresh terms on the table. */
  canPropose: boolean;
  /** propose_project() hangs the proposal off the collab request, so it's required. */
  collabRequestId: string | null;
  /**
   * Set only when there is live work. These are what turn the bar at the top
   * of the thread from a status line into the project itself — the thing the
   * conversation is actually about, pinned where it is always readable.
   */
  projectTitle: string | null;
  currentStage: string | null;
  flowKey: string | null;
}

/**
 * Pick the one thing worth saying about this collaboration right now, most
 * urgent first: terms on the table beat work in progress beats small talk.
 */
function summariseDeal(payload: DealPayload | null): DealSummary | null {
  if (!payload) return null;
  const awaitingMe = !!payload.viewer?.awaiting_me;
  const canPropose = !!payload.viewer?.can_propose;
  const collabRequestId = payload.request?.id ?? null;

  if (payload.proposal) {
    return {
      status: awaitingMe ? 'Terms proposed to you' : 'Terms sent — awaiting reply',
      budget: payload.proposal.budget,
      deliverables: payload.proposal.description,
      projectId: null,
      awaitingMe,
      proposalId: payload.proposal.id,
      canRespond: !!payload.viewer?.can_respond_to_proposal,
      canWithdraw: !!payload.viewer?.can_withdraw_proposal,
      canPropose,
      collabRequestId,
      projectTitle: null,
      currentStage: null,
      flowKey: null,
    };
  }

  if (payload.legacy_pending) {
    return {
      status: awaitingMe ? 'Project awaiting your approval' : 'Project awaiting approval',
      budget: payload.legacy_pending.budget,
      deliverables: payload.legacy_pending.title,
      projectId: null,
      awaitingMe,
      proposalId: null,
      canRespond: false,
      canWithdraw: false,
      canPropose,
      collabRequestId,
      projectTitle: null,
      currentStage: null,
      flowKey: null,
    };
  }

  // `payload.projects` is every non-pending_acceptance project between this
  // pair, NEWEST FIRST — it can hold more than one once a finished project
  // is followed by a new one. Picking [0] blindly meant a just-completed or
  // cancelled project (the newest row) shadowed an OLDER project that was
  // still genuinely active: the pinned card read "Project in progress" for
  // a project that had already finished, and tapping it opened that wrong
  // project instead of the one actually being worked. An open project — if
  // one exists — is always the one worth pinning here.
  const live =
    payload.projects?.find((p) => p.status !== 'completed' && p.status !== 'cancelled') ??
    payload.projects?.[0];
  if (live) {
    return {
      // Reflects the actual row instead of asserting "in progress" for
      // whatever this happened to be — the same status→label mapping the
      // Projects tab uses (dealStateOf), so a completed or cancelled project
      // surfaced here (no open one exists) reads accurately rather than as
      // live work.
      status: DEAL_STATE_LABEL[dealStateOf(live.status)],
      budget: live.budget,
      deliverables: live.title,
      projectId: live.id,
      awaitingMe: false,
      proposalId: null,
      canRespond: false,
      canWithdraw: false,
      canPropose,
      collabRequestId,
      projectTitle: live.title,
      currentStage: live.current_stage ?? null,
      flowKey: live.flow_key ?? null,
    };
  }

  if (payload.request?.status === 'accepted') {
    return {
      status: 'Talking — no terms yet',
      budget: null,
      deliverables: null,
      projectId: null,
      awaitingMe: false,
      proposalId: null,
      canRespond: false,
      canWithdraw: false,
      canPropose,
      collabRequestId,
      projectTitle: null,
      currentStage: null,
      flowKey: null,
    };
  }

  return null;
}

export default function ConversationScreen() {
  const t = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const displaySheet = useRef<SheetRef>(null);
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const me = useSession((s) => s.profile?.id);
  // Per-account, so a shared device does not hand the second person the first
  // person's text size. See lib/use-chat-display.ts.
  const { display, update, scale } = useChatDisplay(me);

  const listRef = useRef<FlatList<ListItem>>(null);
  const dealSheet = useRef<SheetRef>(null);
  const channelRef = useRef<Channel | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  /**
   * Synchronous guard for connectChat.
   *
   * `channelRef.current` is only set after two `await`s, so the mount effect
   * and useFocusEffect below — both calling load() on first render — could
   * both pass the `if (channelRef.current) return` check before either
   * finished connecting. That opened two `message.new` (etc.) listeners on
   * the same channel, and unsubscribeRef only ever kept the second, leaking
   * the first past unmount.
   */
  const connectingRef = useRef(false);

  /** Pre-Stream history, read once from Postgres. */
  const [legacy, setLegacy] = useState<ChatMessage[]>([]);
  /** Live messages from the Stream channel. */
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  /**
   * The other side's last-read timestamp for this channel — what turns a
   * sent tick into a seen one. Sourced from Stream's own read receipts
   * (channel.state.read), not invented locally: Stream does not expose a
   * distinct "delivered" signal separate from "sent" for a plain channel, so
   * there are two tick states here, not three — a single tick means the
   * message reached Stream, a double one means the other person has read it.
   */
  const [otherRead, setOtherRead] = useState<Date | null>(null);

  const [deal, setDeal] = useState<DealSummary | null>(null);
  const [partner, setPartner] = useState<DealPayload['partner']>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [respondBusy, setRespondBusy] = useState(false);
  const [respondError, setRespondError] = useState<string | null>(null);

  // Proposing terms — the step that turns an agreed chat into a real project.
  // Mobile could only ever respond to the other side's proposal; a business
  // working from their phone had to move to the web app to start the project.
  const proposeSheet = useRef<SheetRef>(null);
  const [pTitle, setPTitle] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pBudget, setPBudget] = useState('');
  const [pAdvance, setPAdvance] = useState('');
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // Reply-to and reaction-picker state — both open from a long-press on a
  // bubble, via the same action sheet.
  const actionSheet = useRef<SheetRef>(null);
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const attachSheet = useRef<SheetRef>(null);
  const [uploading, setUploading] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: name ?? 'Chat',
      /**
       * The only header action. Deliberately not a call button: this app does
       * not place calls, and an affordance that looks like it does is a
       * promise the product cannot keep.
       */
      headerRight: () => (
        <Pressable
          onPress={() => displaySheet.current?.expand()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Chat display options"
          style={({ pressed }) => ({ paddingHorizontal: 4, opacity: pressed ? 0.5 : 1 })}
        >
          <MoreVertical size={20} color={t.color.brand} />
        </Pressable>
      ),
    });
  }, [navigation, name, t.color.brand]);

  const messages = useMemo(() => mergeMessages(legacy, live), [legacy, live]);
  const listItems = useMemo(() => withDaySeparators(messages), [messages]);
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  /**
   * Join the Stream channel this conversation maps to, and keep it live.
   *
   * Everything sent from the web dashboard lands here, not in Postgres — see
   * lib/stream.ts. Failing to connect costs the live thread but leaves the
   * legacy history and the deal card intact.
   */
  const connectChat = useCallback(
    async (otherUserId: string) => {
      if (channelRef.current || connectingRef.current) return;
      connectingRef.current = true;

      if (!isStreamConfigured()) {
        setChatError('Chat is not configured in this build.');
        connectingRef.current = false;
        return;
      }

      const channel = await getConversationChannel(id, otherUserId);
      if (!channel) {
        // 'token_failed' means the server rejected or errored on the sign-in
        // call before a WebSocket was ever attempted — that's not a device
        // network issue, so don't tell the user to check their connection.
        const reason = getLastStreamFailureReason();
        setChatError(
          reason === 'token_failed'
            ? "Chat is unavailable right now. Pull down to try again."
            : "Couldn't connect to chat. Check your connection and pull down to try again.",
        );
        connectingRef.current = false;
        return;
      }

      channelRef.current = channel;
      connectingRef.current = false;
      setChatError(null);
      setLive((channel.state.messages ?? []).map(fromStream));
      setOtherRead(channel.state.read[otherUserId]?.last_read ?? null);

      // Reading the screen IS reading the messages.
      void markConversationRead(channel);

      /** Reaction events carry the whole updated message — just re-map it in. */
      const applyUpdatedMessage = (event: { message?: StreamMessage }) => {
        if (!event.message) return;
        const updated = fromStream(event.message);
        setLive((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      };

      const subs = [
        channel.on('message.new', (event) => {
          if (!event.message) return;
          const incoming = fromStream(event.message);
          setLive((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
          // A message that arrives while you are looking at the thread has been
          // read on arrival — without this the badge climbs back up the moment
          // the other person replies to an open conversation.
          void markConversationRead(channel);
        }),
        // Reactions are their own events (not message.new) — without these, a
        // reaction added from this device or from web only appeared after the
        // thread was closed and reopened.
        channel.on('reaction.new', applyUpdatedMessage),
        channel.on('reaction.updated', applyUpdatedMessage),
        channel.on('reaction.deleted', applyUpdatedMessage),
        // The SDK updates channel.state.read BEFORE dispatching this event,
        // so re-reading it here rather than trusting the event payload is
        // always at least as fresh.
        channel.on('message.read', (event) => {
          if (event.user?.id !== otherUserId) return;
          setOtherRead(channel.state.read[otherUserId]?.last_read ?? null);
        }),
      ];
      unsubscribeRef.current = () => subs.forEach((s) => s.unsubscribe());
    },
    [id]
  );

  /**
   * Legacy history + the deal card. Both come from our own API and neither
   * depends on Stream being reachable.
   */
  const load = useCallback(async () => {
    const [msgRes, dealRes] = await Promise.all([
      endpoints.listMessages<{ messages: Message[] }>(id),
      endpoints.getDeal<DealPayload>(id),
    ]);

    if (msgRes.ok) setLegacy((msgRes.data?.messages ?? []).map(fromPostgres));
    if (dealRes.ok) {
      setDeal(summariseDeal(dealRes.data));
      setPartner(dealRes.data?.partner ?? null);
      // other_user_id is the only place the API tells us who to open the
      // channel with, so the chat connection hangs off this response.
      const otherUserId = dealRes.data?.other_user_id;
      if (otherUserId) void connectChat(otherUserId);
    }
  }, [id, connectChat]);

  useEffect(() => {
    void load();
  }, [load]);

  // Anything that landed while this screen was backgrounded — or while the
  // socket was down on a flaky connection — is only picked up by re-reading.
  useFocusEffect(
    useCallback(() => {
      void load();
      const channel = channelRef.current;
      if (channel) {
        void channel.watch().then(() => {
          setLive((channel.state.messages ?? []).map(fromStream));
          if (partner?.id) setOtherRead(channel.state.read[partner.id]?.last_read ?? null);
          void markConversationRead(channel);
        });
      }
      // On the way out, push the freshly-cleared counts to the badges rather
      // than leaving a stale number sitting there for up to a minute.
      return () => {
        void useNotificationSummary.getState().refresh();
      };
    }, [load, partner?.id])
  );

  // Leave the channel behind on the way out so its socket handlers don't
  // outlive the screen.
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      channelRef.current = null;
      connectingRef.current = false;
    };
  }, [id]);

  /**
   * Accept, decline, or withdraw the proposal currently on the table — the
   * one deal action the web app had that mobile didn't: this sheet used to
   * just point people at the web app to do it.
   */
  async function respondToProposal(action: 'accept' | 'decline' | 'withdraw') {
    if (!deal?.proposalId) return;
    setRespondBusy(true);
    setRespondError(null);

    const res = await endpoints.respondToDeal<{
      conversions: { used: number; limit: number } | null;
    }>(id, { proposal_id: deal.proposalId, action });
    setRespondBusy(false);

    if (!res.ok) {
      setRespondError(res.error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dealSheet.current?.close();

    // Positive confirmation of where the brand now stands on the free project
    // cap — the server only fills this in when the caller owns the new project
    // and is on a metered Free plan (see the deal route).
    const conv = action === 'accept' ? res.data?.conversions : null;
    if (conv) {
      const left = conv.limit - conv.used;
      useNotificationToast.getState().push({
        id: `local:conversions:${Date.now()}`,
        type: 'upsell',
        title: 'Project started',
        body:
          left > 0
            ? `You've used ${conv.used} of ${conv.limit} free project conversions — ${left} left.`
            : `You've used all ${conv.limit} free project conversions. Upgrade to Pro for unlimited.`,
        link: '/dashboard/billing',
        receivedAt: Date.now(),
      });
    }

    void load();
  }

  /**
   * Put fresh terms on the table. The other side then accepts (which creates
   * the project) or declines — nothing is committed by sending alone.
   *
   * Budget/advance are optional here exactly as on web: the pair may have
   * already settled the number in chat and just want the project opened.
   */
  async function submitProposal() {
    if (!deal?.collabRequestId) return;
    const title = pTitle.trim();
    if (!title) {
      setProposeError('Give the project a title.');
      return;
    }

    // Keep the sign so "-500" is rejected rather than silently becoming 500 —
    // the same bug that was fixed on the web request form.
    const budget = pBudget.trim() ? Number(pBudget.replace(/[^0-9.-]/g, '')) : undefined;
    const advance = pAdvance.trim() ? Number(pAdvance.replace(/[^0-9.-]/g, '')) : undefined;
    if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) {
      setProposeError('Budget must be a positive number.');
      return;
    }
    if (advance !== undefined && (!Number.isFinite(advance) || advance < 0)) {
      setProposeError('Advance must be a positive number.');
      return;
    }
    if (budget !== undefined && advance !== undefined && advance > budget) {
      setProposeError('The advance can’t be more than the total budget.');
      return;
    }

    setProposeBusy(true);
    setProposeError(null);

    const res = await endpoints.updateDeal(id, {
      collab_request_id: deal.collabRequestId,
      title,
      description: pDescription.trim() || undefined,
      budget,
      advance_amount: advance,
    });
    setProposeBusy(false);

    if (!res.ok) {
      setProposeError(res.error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    proposeSheet.current?.close();
    setPTitle('');
    setPDescription('');
    setPBudget('');
    setPAdvance('');
    void load();
  }

  async function send() {
    const body = draft.trim();
    const channel = channelRef.current;
    if (!body || !channel) return;

    setSending(true);
    setDraft('');
    const quotedId = replyTo?.id;
    setReplyTo(null);

    try {
      // Stream echoes the sent message back through `message.new`, so there is
      // nothing to append here.
      await channel.sendMessage({ text: body, quoted_message_id: quotedId });
    } catch {
      // Put the text and the reply-target back rather than losing them.
      setDraft(body);
      if (quotedId) setReplyTo(messageById.get(quotedId) ?? null);
    } finally {
      setSending(false);
    }
  }

  /**
   * Toggle one reaction type for the signed-in user on a message.
   *
   * Web's default reaction bar behaves the same way — tapping an emoji you've
   * already left removes it rather than stacking a second one.
   */
  async function toggleReaction(message: ChatMessage, type: string) {
    const channel = channelRef.current;
    if (!channel) return;
    const mine = message.reactions.find((r) => r.type === type)?.mine;
    void Haptics.selectionAsync();
    try {
      if (mine) {
        await channel.deleteReaction(message.id, type);
      } else {
        await channel.sendReaction(message.id, { type });
      }
      // channel.on('reaction.*') updates `live` from the server response, but
      // legacy Postgres messages can never carry reactions and never will —
      // reacting to one is a silent no-op response, nothing to reconcile here.
    } catch (err) {
      console.warn('[chat] reaction failed:', err);
    }
  }

  function openActions(message: ChatMessage) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActionTarget(message);
    actionSheet.current?.expand();
  }

  function startReply(message: ChatMessage) {
    setReplyTo(message);
    actionSheet.current?.close();
  }

  /** Copy a bubble's text. Media-only messages have nothing to copy, so the
   *  sheet leaves the option out rather than copying an empty string. */
  async function copyMessage(message: ChatMessage) {
    if (!message.body) return;
    await Clipboard.setStringAsync(message.body);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    actionSheet.current?.close();
  }

  /**
   * Pick a photo and send it as an image attachment, exactly like the web
   * composer's image upload — same Stream CDN, same attachment shape, so a
   * photo sent from either side renders correctly on the other.
   */
  async function pickAndSendImage() {
    attachSheet.current?.close();
    const channel = channelRef.current;
    if (!channel) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setChatError('Allow photo library access in Settings to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      const uploaded = await channel.sendImage(
        asset.uri,
        asset.fileName || `photo-${Date.now()}.jpg`,
        asset.mimeType || 'image/jpeg'
      );
      await channel.sendMessage({
        text: '',
        attachments: [{ type: 'image', image_url: uploaded.file, fallback: asset.fileName || 'Photo' }],
      });
    } catch (err) {
      console.warn('[chat] image send failed:', err);
      setChatError("Couldn't send that photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  /**
   * Pick any document and send it as a file attachment.
   *
   * Requires expo-document-picker, a new native module — it will not work
   * until the app is rebuilt (EAS build) and reinstalled; a JS-only OTA
   * update is not enough for a module that was not compiled into the binary.
   */
  async function pickAndSendDocument() {
    attachSheet.current?.close();
    const channel = channelRef.current;
    if (!channel) return;

    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    setUploading(true);
    try {
      const uploaded = await channel.sendFile(
        asset.uri,
        asset.name,
        asset.mimeType || 'application/octet-stream'
      );
      await channel.sendMessage({
        text: '',
        attachments: [
          {
            type: 'file',
            asset_url: uploaded.file,
            title: asset.name,
            file_size: asset.size ?? undefined,
            mime_type: asset.mimeType,
          },
        ],
      });
    } catch (err) {
      console.warn('[chat] file send failed:', err);
      setChatError("Couldn't send that file. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <KeyboardAvoider style={{ backgroundColor: t.color.surface }}>
      {/*
        The deal bar — the web's side panel, compressed to something you can
        always see while you are negotiating. Pinned above the message list, so
        it never scrolls away from a conversation that is entirely about it.

        Two shapes. Once there is a live project it names the WORK: title on
        the first line, state and stage on the second. Before that there is no
        project to name, so it stays the single status line it always was —
        "Terms proposed to you", "Talking — no terms yet" — which is the whole
        truth at that point.
      */}
      {deal ? (
        <Pressable onPress={() => dealSheet.current?.expand()} accessibilityRole="button">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingHorizontal: t.spacing.screen,
              paddingVertical: t.spacing.md,
              // Something waiting on you gets the warm tint; everything else
              // stays in brand so the bar isn't crying wolf on every open.
              backgroundColor: deal.awaitingMe ? t.color.warnSoft : t.color.brandSoft,
              borderBottomWidth: 1,
              borderBottomColor: t.color.hairline,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: t.radii.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.color.surfaceCard,
              }}
            >
              {deal.projectTitle ? (
                <FileText size={17} color={deal.awaitingMe ? t.color.warn : t.color.brand} />
              ) : (
                <Handshake size={17} color={deal.awaitingMe ? t.color.warn : t.color.brand} />
              )}
            </View>

            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              {deal.projectTitle ? (
                <>
                  <Txt variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                    {deal.projectTitle}
                  </Txt>
                  <Txt
                    variant="caption"
                    numberOfLines={1}
                    style={{
                      color: deal.awaitingMe ? t.color.warn : t.color.brandStrong,
                      fontWeight: '600',
                    }}
                  >
                    {deal.status}
                    {stageLine(deal.currentStage, deal.flowKey)}
                    {deal.budget ? ` · ${formatCurrency(deal.budget)}` : ''}
                  </Txt>
                </>
              ) : (
                <Txt
                  variant="footnote"
                  style={{ color: deal.awaitingMe ? t.color.warn : t.color.brandStrong }}
                  numberOfLines={1}
                >
                  {deal.status}
                  {deal.budget ? ` · ${formatCurrency(deal.budget)}` : ''}
                </Txt>
              )}
            </View>

            <ChevronRight size={16} color={deal.awaitingMe ? t.color.warn : t.color.brand} />
          </View>
        </Pressable>
      ) : null}

      {chatError ? (
        <View
          style={{
            paddingHorizontal: t.spacing.screen,
            paddingVertical: t.spacing.sm,
            backgroundColor: t.color.warnSoft,
          }}
        >
          <Txt variant="footnote" tone="warn" center>
            {chatError}
          </Txt>
        </View>
      ) : null}

      {/* The paper sits under the list, not behind the whole screen: the deal
          bar and the composer are chrome and belong on the app's own surface.
          `flex: 1` on the wrapper is what gives the list its height. */}
      <ChatPaper enabled={display.wallpaper}>
      <FlatList
        ref={listRef}
        data={listItems}
        keyExtractor={(item) => item.id}
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{
          padding: t.spacing.screen,
          gap: t.spacing.sm,
          flexGrow: 1,
          justifyContent: 'flex-end',
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          if (item.kind === 'separator') {
            return (
              <View style={{ alignItems: 'center', paddingVertical: t.spacing.xs }}>
                <View
                  style={{
                    paddingHorizontal: t.spacing.sm,
                    paddingVertical: 4,
                    borderRadius: t.radii.md,
                    backgroundColor: t.color.surfaceMuted,
                  }}
                >
                  <Txt variant="caption" tone="muted" style={{ fontSize: 11, fontWeight: '700' }}>
                    {item.label}
                  </Txt>
                </View>
              </View>
            );
          }

          const message = item.message;
          const mine = message.sender_user_id === me;
          const quotedSender =
            message.quoted && message.quoted.sender_user_id === me
              ? 'You'
              : partner?.name || 'Them';

          return (
            <Pressable
              onLongPress={() => (message.deleted ? undefined : openActions(message))}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '82%',
                gap: 3,
              }}
            >
              <View
                style={{
                  backgroundColor: mine ? t.color.brand : t.color.surfaceCard,
                  borderWidth: mine ? 0 : 1,
                  borderColor: t.color.hairline,
                  borderRadius: t.radii.lg,
                  // Tail corner on the sender's side.
                  borderBottomRightRadius: mine ? 4 : t.radii.lg,
                  borderBottomLeftRadius: mine ? t.radii.lg : 4,
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: 10,
                  gap: 6,
                  overflow: 'hidden',
                }}
              >
                {message.quoted ? (
                  <View
                    style={{
                      borderLeftWidth: 2,
                      borderLeftColor: mine ? t.color.white : t.color.brand,
                      paddingLeft: t.spacing.sm,
                      opacity: 0.85,
                    }}
                  >
                    <Txt
                      variant="caption"
                      style={{ fontWeight: '700', color: mine ? t.color.white : t.color.brand }}
                    >
                      {quotedSender}
                    </Txt>
                    <Txt
                      variant="caption"
                      numberOfLines={1}
                      style={{ color: mine ? t.color.white : t.color.contentSoft }}
                    >
                      {message.quoted.body || 'Message'}
                    </Txt>
                  </View>
                ) : null}

                {message.attachments
                  .filter((a) => a.type === 'image' && a.image_url)
                  .map((a, i) => (
                    <Pressable key={`${a.image_url}-${i}`} onPress={() => setViewerUrl(a.image_url!)}>
                      <Image
                        source={{ uri: a.image_url }}
                        style={{ width: 220, height: 220, borderRadius: t.radii.md }}
                        resizeMode="cover"
                      />
                    </Pressable>
                  ))}

                {message.attachments
                  .filter((a) => a.type === 'file' && a.asset_url)
                  .map((a, i) => (
                    <Pressable
                      key={`${a.asset_url}-${i}`}
                      onPress={() => Linking.openURL(a.asset_url!)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: t.spacing.sm,
                        backgroundColor: mine ? 'rgba(255,255,255,0.15)' : t.color.surfaceMuted,
                        borderRadius: t.radii.md,
                        paddingHorizontal: t.spacing.sm,
                        paddingVertical: t.spacing.sm,
                      }}
                    >
                      <FileText size={18} color={mine ? t.color.white : t.color.content} />
                      <Txt
                        variant="footnote"
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          color: mine ? t.color.white : t.color.content,
                          fontSize: 13 * scale,
                          lineHeight: 18 * scale,
                        }}
                      >
                        {a.title || 'File'}
                      </Txt>
                    </Pressable>
                  ))}

                {message.body ? (
                  /* Scaled by the reader's own chat text size — multiplied on
                     top of the OS setting rather than replacing it, so someone
                     who has already scaled their phone up gets a bigger chat
                     still. See lib/use-chat-display.ts. */
                  <Txt
                    variant="body"
                    style={{
                      color: mine ? t.color.white : t.color.content,
                      fontSize: 16 * scale,
                      lineHeight: 23 * scale,
                    }}
                  >
                    {message.deleted ? 'Message deleted' : message.body}
                  </Txt>
                ) : null}
              </View>

              {message.reactions.length > 0 ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 4,
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  {message.reactions.map((r) => (
                    <Pressable
                      key={r.type}
                      onPress={() => toggleReaction(message, r.type)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: t.radii.md,
                        borderWidth: 1,
                        borderColor: r.mine ? t.color.brand : t.color.hairline,
                        backgroundColor: r.mine ? t.color.brandSoft : t.color.surfaceCard,
                      }}
                    >
                      <Txt variant="caption" style={{ fontSize: 12 }}>
                        {REACTION_EMOJI.get(r.type) ?? r.type}
                      </Txt>
                      <Txt variant="caption" tone="muted" style={{ fontSize: 11 }}>
                        {r.count}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                }}
              >
                <Txt
                  variant="caption"
                  tone="muted"
                  style={{
                    fontSize: 11 * scale,
                    lineHeight: 15 * scale,
                  }}
                >
                  {formatMessageTime(message.created_at)}
                </Txt>
                {/* Read receipt — only ever on your own bubbles, since seeing a
                   tick under the other person's message would claim to know
                   whether THEY have read something, which we have no way to
                   tell them. Two states, not three — see the otherRead note
                   above for why there is no separate "delivered" tick. */}
                {mine && !message.deleted ? (
                  otherRead && new Date(message.created_at) <= otherRead ? (
                    <CheckCheck
                      size={13}
                      color={t.color.brand}
                      accessibilityLabel="Seen"
                    />
                  ) : (
                    <Check
                      size={13}
                      color={t.color.contentMuted}
                      accessibilityLabel="Sent"
                    />
                  )
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
      </ChatPaper>

      {replyTo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingHorizontal: t.spacing.screen,
            paddingVertical: t.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: t.color.hairline,
            backgroundColor: t.color.surfaceMuted,
          }}
        >
          <CornerUpLeft size={15} color={t.color.brand} />
          <View style={{ flex: 1 }}>
            <Txt variant="caption" style={{ fontWeight: '700', color: t.color.brand }}>
              Replying to {replyTo.sender_user_id === me ? 'yourself' : partner?.name || 'them'}
            </Txt>
            <Txt variant="caption" tone="muted" numberOfLines={1}>
              {replyTo.body || 'Message'}
            </Txt>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <X size={16} color={t.color.contentMuted} />
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.screen,
          paddingTop: t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.sm,
          borderTopWidth: replyTo ? 0 : 1,
          borderTopColor: t.color.hairline,
          backgroundColor: t.color.surfaceCard,
        }}
      >
        <Pressable
          onPress={() => attachSheet.current?.expand()}
          disabled={!channelRef.current || uploading}
          accessibilityRole="button"
          accessibilityLabel="Attach"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.color.surfaceMuted,
          }}
        >
          <Paperclip size={19} color={t.color.contentSoft} />
        </Pressable>
        <Field
          containerStyle={{ flex: 1 }}
          value={draft}
          onChangeText={setDraft}
          // Sending needs the channel, so say so rather than letting someone
          // type a message that has nowhere to go.
          placeholder={channelRef.current ? 'Write a message' : 'Connecting…'}
          multiline
          style={{ minHeight: 44, maxHeight: 120 }}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending || !channelRef.current}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              draft.trim() && channelRef.current ? t.color.brand : t.color.hairlineStrong,
          }}
        >
          <SendHorizontal size={19} color={t.color.white} />
        </Pressable>
      </View>

      <Sheet ref={dealSheet} title="Deal terms">
        {/* Ownership trust signal — only meaningful when the other side is a
            creator, i.e. only a business viewer ever sees this. */}
        {partner?.role === 'influencer' ? (
          partner.verified_badge ? (
            <Badge
              label="Verified by Influnet"
              tone="verified"
              icon={<VerifiedBadge size={13} />}
            />
          ) : (
            <Card style={{ backgroundColor: t.color.warnSoft, borderColor: t.color.warn, gap: 2 }}>
              <Txt variant="footnote" style={{ fontWeight: '700', color: t.color.warn }}>
                Ownership not verified
              </Txt>
              <Txt variant="footnote" style={{ color: t.color.warn }}>
                {partner.name || 'This creator'} hasn&apos;t confirmed they control the
                social accounts on their profile.
              </Txt>
            </Card>
          )
        ) : null}

        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="footnote" tone="muted">
              Status
            </Txt>
            <Txt variant="footnote">{deal?.status ?? 'Negotiating'}</Txt>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Txt variant="footnote" tone="muted">
              Budget
            </Txt>
            <Txt variant="footnote">{formatCurrency(deal?.budget)}</Txt>
          </View>
          {deal?.deliverables ? (
            <View style={{ gap: 4 }}>
              <Txt variant="footnote" tone="muted">
                Deliverables
              </Txt>
              <Txt variant="callout" tone="soft">
                {deal.deliverables}
              </Txt>
            </View>
          ) : null}
        </Card>

        {respondError ? (
          <Card style={{ backgroundColor: t.color.dangerSoft, borderColor: t.color.danger }}>
            <Txt variant="footnote" tone="danger">
              {respondError}
            </Txt>
          </Card>
        ) : null}

        {deal?.canRespond ? (
          <View style={{ gap: t.spacing.sm }}>
            <Button
              label="Accept these terms"
              onPress={() => respondToProposal('accept')}
              loading={respondBusy}
            />
            <Button
              label="Decline"
              variant="ghost"
              onPress={() => respondToProposal('decline')}
              loading={respondBusy}
            />
          </View>
        ) : deal?.canWithdraw ? (
          <Button
            label="Withdraw these terms"
            variant="secondary"
            onPress={() => respondToProposal('withdraw')}
            loading={respondBusy}
          />
        ) : deal?.canPropose ? (
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="footnote" tone="muted">
              Agreed the scope in chat? Put it in writing — they accept, and the project opens.
            </Txt>
            <Button
              label="Propose project terms"
              icon={<Handshake size={16} color={t.color.white} />}
              onPress={() => {
                dealSheet.current?.close();
                proposeSheet.current?.expand();
              }}
            />
          </View>
        ) : (
          <Txt variant="footnote" tone="muted">
            {deal?.awaitingMe
              ? 'Terms are waiting on you.'
              : 'Nothing is committed until you both approve a project. Agree the scope here first.'}
          </Txt>
        )}

        {deal?.projectId ? (
          <Button
            label="Open the project"
            onPress={() => {
              dealSheet.current?.close();
              router.push({ pathname: '/projects/[id]', params: { id: deal.projectId! } });
            }}
          />
        ) : null}
      </Sheet>

      {/*
        Display options. The reason this menu exists is text size: a thread is
        the one screen in this app people read for minutes at a stretch, and
        the size that suits reading is routinely not the size someone wants for
        every button on their phone.
      */}
      <Sheet ref={displaySheet} title="Display">
        <View style={{ gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Text size
            </Txt>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {(['small', 'default', 'large', 'xl'] as ChatTextSize[]).map((size) => {
                const active = display.textSize === size;
                return (
                  <Pressable
                    key={size}
                    onPress={() => update({ textSize: size })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Text size ${TEXT_SIZE_LABEL[size]}`}
                    style={{
                      flex: 1,
                      paddingVertical: t.spacing.md,
                      borderRadius: t.radii.md,
                      borderWidth: 1.5,
                      borderColor: active ? t.color.brand : t.color.hairlineStrong,
                      backgroundColor: active ? t.color.brandSoft : 'transparent',
                      alignItems: 'center',
                    }}
                  >
                    {/* Each option is set AT the size it selects, so the
                        control is its own preview and nobody has to apply a
                        setting to find out what it does. */}
                    <Txt
                      style={{
                        fontSize: 15 * TEXT_SCALE_PREVIEW[size],
                        fontWeight: active ? '700' : '500',
                        color: active ? t.color.brand : t.color.contentSoft,
                      }}
                    >
                      {TEXT_SIZE_LABEL[size]}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            onPress={() => update({ wallpaper: !display.wallpaper })}
            accessibilityRole="switch"
            accessibilityState={{ checked: display.wallpaper }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.sm,
            }}
          >
            <ImageIcon size={19} color={t.color.contentSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                Chat wallpaper
              </Txt>
              <Txt variant="caption" tone="muted">
                The patterned paper behind messages
              </Txt>
            </View>
            <View
              style={{
                width: 46,
                height: 27,
                borderRadius: 14,
                padding: 3,
                backgroundColor: display.wallpaper ? t.color.brand : t.color.hairlineStrong,
                alignItems: display.wallpaper ? 'flex-end' : 'flex-start',
              }}
            >
              <View
                style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: t.color.white }}
              />
            </View>
          </Pressable>

          {/* Muting is a notification preference and lives with the others.
              Linked rather than duplicated — two places to mute a chat is two
              places for them to disagree. */}
          <Pressable
            onPress={() => {
              displaySheet.current?.close();
              router.push('/settings');
            }}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.sm,
            }}
          >
            <BellOff size={19} color={t.color.contentSoft} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
                Notifications
              </Txt>
              <Txt variant="caption" tone="muted">
                Manage message alerts in Settings
              </Txt>
            </View>
            <ChevronRight size={16} color={t.color.contentMuted} />
          </Pressable>
        </View>
      </Sheet>

      <Sheet ref={proposeSheet} title="Propose project terms">
        <Txt variant="footnote" tone="muted">
          {partner?.name ?? 'They'} reviews this and accepts or declines. Accepting is what
          actually creates the project — sending it commits nothing.
        </Txt>

        <Field
          label="Project title"
          placeholder="Diwali reel series"
          value={pTitle}
          onChangeText={(v) => {
            setPTitle(v);
            if (proposeError) setProposeError(null);
          }}
        />

        <Field
          label="What's involved (optional)"
          placeholder="Two 30-second reels featuring the new range, shot at home, delivered by the 20th."
          value={pDescription}
          onChangeText={setPDescription}
          multiline
          hint="Scope, deliverables and timing — the clearer this is, the fewer change requests later."
        />

        <Field
          label="Total budget (optional)"
          placeholder="50000"
          value={pBudget}
          onChangeText={(v) => {
            setPBudget(v);
            if (proposeError) setProposeError(null);
          }}
          keyboardType="number-pad"
          hint="Leave blank if you've already settled it in chat."
        />

        <Field
          label="Advance (optional)"
          placeholder="15000"
          value={pAdvance}
          onChangeText={(v) => {
            setPAdvance(v);
            if (proposeError) setProposeError(null);
          }}
          keyboardType="number-pad"
          hint="Paid up front at the deposit stage. Must not exceed the total."
          error={proposeError}
        />

        <Button
          label="Send these terms"
          onPress={submitProposal}
          disabled={proposeBusy || !pTitle.trim()}
          loading={proposeBusy}
        />
      </Sheet>

      {/* Long-press on a bubble: react, or reply to it. */}
      <Sheet ref={actionSheet} title="Message" onClose={() => setActionTarget(null)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: t.spacing.xs }}>
          {REACTIONS.map((r) => (
            <Pressable
              key={r.type}
              onPress={() => {
                if (actionTarget) void toggleReaction(actionTarget, r.type);
                actionSheet.current?.close();
              }}
              hitSlop={6}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: actionTarget?.reactions.some((x) => x.type === r.type && x.mine)
                  ? t.color.brandSoft
                  : 'transparent',
              }}
            >
              <Txt style={{ fontSize: 24 }}>{r.emoji}</Txt>
            </Pressable>
          ))}
        </View>
        <Button
          label="Reply"
          variant="secondary"
          icon={<CornerUpLeft size={16} color={t.color.brand} />}
          onPress={() => actionTarget && startReply(actionTarget)}
        />
        {actionTarget?.body ? (
          <Button
            label="Copy text"
            variant="secondary"
            icon={<Copy size={16} color={t.color.brand} />}
            onPress={() => actionTarget && void copyMessage(actionTarget)}
          />
        ) : null}
      </Sheet>

      {/* Attach: photo now, document once this build is rebuilt with
          expo-document-picker (it's a native module — see pickAndSendDocument). */}
      <Sheet ref={attachSheet} title="Send">
        <Button label="Photo" icon={<Paperclip size={16} color={t.color.white} />} onPress={pickAndSendImage} />
        <Button
          label="Document"
          variant="secondary"
          icon={<FileText size={16} color={t.color.brand} />}
          onPress={pickAndSendDocument}
        />
      </Sheet>

      {/* Full-screen image viewer — tap any photo bubble to open, tap anywhere to close. */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <Pressable
          onPress={() => setViewerUrl(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
        >
          {viewerUrl ? (
            <Image
              source={{ uri: viewerUrl }}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          ) : null}
          <Pressable
            onPress={() => setViewerUrl(null)}
            hitSlop={12}
            style={{
              position: 'absolute',
              top: insets.top + t.spacing.md,
              right: t.spacing.screen,
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.15)',
            }}
          >
            <X size={20} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoider>
  );
}
