import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Handshake, SendHorizontal } from 'lucide-react-native';
import type { Channel, LocalMessage, MessageResponse } from 'stream-chat';
import type { Message } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { getConversationChannel, isStreamConfigured } from '@/lib/stream';
import { useNotificationSummary } from '@/lib/notification-summary';
import { formatCurrency, timeAgo } from '@/lib/format';

/** Stream hands back slightly different message types by call site. */
type StreamMessage = MessageResponse | LocalMessage;
import { Badge, Button, Card, Field, Sheet, Txt, VerifiedBadge, type SheetRef } from '@/components/ui';

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
  projects?: { id: string; title: string; budget: number | null; status: string }[];
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

/**
 * One bubble, whichever backend it came from.
 *
 * Postgres holds the pre-Stream history and Stream holds everything since, so
 * the list renders a single normalised shape rather than branching per source.
 */
interface ChatMessage {
  id: string;
  body: string;
  sender_user_id: string;
  created_at: string;
  deleted: boolean;
}

function fromPostgres(m: Message): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    sender_user_id: m.sender_user_id,
    created_at: m.created_at,
    deleted: !!m.deleted,
  };
}

function fromStream(m: StreamMessage): ChatMessage {
  const at = m.created_at;
  return {
    id: m.id,
    body: m.text ?? '',
    sender_user_id: m.user?.id ?? '',
    created_at: at instanceof Date ? at.toISOString() : (at ?? new Date().toISOString()),
    deleted: !!m.deleted_at || m.type === 'deleted',
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
 * Legacy history then live messages, in time order and deduped by id.
 *
 * The two sources don't overlap today, but ordering by timestamp rather than by
 * source means they'd still interleave correctly if they ever did.
 */
function mergeMessages(legacy: ChatMessage[], live: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...legacy, ...live]) byId.set(m.id, m);
  return [...byId.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
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
    };
  }

  const live = payload.projects?.[0];
  if (live) {
    return {
      status: 'Project in progress',
      budget: live.budget,
      deliverables: live.title,
      projectId: live.id,
      awaitingMe: false,
      proposalId: null,
      canRespond: false,
      canWithdraw: false,
      canPropose,
      collabRequestId,
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
    };
  }

  return null;
}

export default function ConversationScreen() {
  const t = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const me = useSession((s) => s.profile?.id);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const dealSheet = useRef<SheetRef>(null);
  const channelRef = useRef<Channel | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  /** Pre-Stream history, read once from Postgres. */
  const [legacy, setLegacy] = useState<ChatMessage[]>([]);
  /** Live messages from the Stream channel. */
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

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

  useEffect(() => {
    navigation.setOptions({ title: name ?? 'Chat' });
  }, [navigation, name]);

  const messages = mergeMessages(legacy, live);

  /**
   * Join the Stream channel this conversation maps to, and keep it live.
   *
   * Everything sent from the web dashboard lands here, not in Postgres — see
   * lib/stream.ts. Failing to connect costs the live thread but leaves the
   * legacy history and the deal card intact.
   */
  const connectChat = useCallback(
    async (otherUserId: string) => {
      if (channelRef.current) return;

      if (!isStreamConfigured()) {
        setChatError('Chat is not configured in this build.');
        return;
      }

      const channel = await getConversationChannel(id, otherUserId);
      if (!channel) {
        setChatError("Couldn't connect to chat. Pull down to try again.");
        return;
      }

      channelRef.current = channel;
      setChatError(null);
      setLive((channel.state.messages ?? []).map(fromStream));

      // Reading the screen IS reading the messages.
      void markConversationRead(channel);

      const subscription = channel.on('message.new', (event) => {
        if (!event.message) return;
        const incoming = fromStream(event.message);
        setLive((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
        );
        // A message that arrives while you are looking at the thread has been
        // read on arrival — without this the badge climbs back up the moment
        // the other person replies to an open conversation.
        void markConversationRead(channel);
      });
      unsubscribeRef.current = subscription.unsubscribe;
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
          void markConversationRead(channel);
        });
      }
      // On the way out, push the freshly-cleared counts to the badges rather
      // than leaving a stale number sitting there for up to a minute.
      return () => {
        void useNotificationSummary.getState().refresh();
      };
    }, [load])
  );

  // Leave the channel behind on the way out so its socket handlers don't
  // outlive the screen.
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      channelRef.current = null;
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

    const res = await endpoints.respondToDeal(id, { proposal_id: deal.proposalId, action });
    setRespondBusy(false);

    if (!res.ok) {
      setRespondError(res.error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dealSheet.current?.close();
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

    try {
      // Stream echoes the sent message back through `message.new`, so there is
      // nothing to append here.
      await channel.sendMessage({ text: body });
    } catch {
      // Put the text back rather than losing what they typed.
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.color.surface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
    >
      {/* Deal bar — the web's side panel, compressed to a single line you can
          always see while you're negotiating. */}
      {deal ? (
        <Pressable onPress={() => dealSheet.current?.expand()} accessibilityRole="button">
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              paddingHorizontal: t.spacing.screen,
              paddingVertical: t.spacing.md,
              // Something waiting on you gets the warm tint; everything else
              // stays in brand so the bar isn't crying wolf on every open.
              backgroundColor: deal.awaitingMe ? t.color.warnSoft : t.color.brandSoft,
              borderBottomWidth: 1,
              borderBottomColor: t.color.hairline,
            }}
          >
            <Handshake size={17} color={deal.awaitingMe ? t.color.warn : t.color.brand} />
            <Txt
              variant="footnote"
              style={{ flex: 1, color: deal.awaitingMe ? t.color.warn : t.color.brandStrong }}
              numberOfLines={1}
            >
              {deal.status}
              {deal.budget ? ` · ${formatCurrency(deal.budget)}` : ''}
            </Txt>
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

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{
          padding: t.spacing.screen,
          gap: t.spacing.sm,
          flexGrow: 1,
          justifyContent: 'flex-end',
        }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.sender_user_id === me;
          return (
            <View
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
                }}
              >
                <Txt variant="body" style={{ color: mine ? t.color.white : t.color.content }}>
                  {item.deleted ? 'Message deleted' : item.body}
                </Txt>
              </View>
              <Txt
                variant="caption"
                tone="muted"
                style={{ alignSelf: mine ? 'flex-end' : 'flex-start', fontSize: 11 }}
              >
                {timeAgo(item.created_at)}
              </Txt>
            </View>
          );
        }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: t.spacing.sm,
          paddingHorizontal: t.spacing.screen,
          paddingTop: t.spacing.sm,
          paddingBottom: insets.bottom + t.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: t.color.hairline,
          backgroundColor: t.color.surfaceCard,
        }}
      >
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
    </KeyboardAvoidingView>
  );
}
