import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Handshake, SendHorizontal } from 'lucide-react-native';
import type { Message } from '@influnet/types';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { endpoints } from '@/lib/api';
import { formatCurrency, timeAgo } from '@/lib/format';
import { Button, Card, Field, Sheet, Txt, type SheetRef } from '@/components/ui';

interface DealPayload {
  deal?: {
    status?: string;
    budget?: number | null;
    deliverables?: string | null;
    project_id?: string | null;
  } | null;
}

export default function ConversationScreen() {
  const t = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const me = useSession((s) => s.profile?.id);

  const listRef = useRef<FlatList<Message>>(null);
  const dealSheet = useRef<SheetRef>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [deal, setDeal] = useState<DealPayload['deal']>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: name ?? 'Chat' });
  }, [navigation, name]);

  const load = useCallback(async () => {
    const [msgRes, dealRes] = await Promise.all([
      endpoints.listMessages<{ messages: Message[] }>(id),
      endpoints.getDeal<DealPayload>(id),
    ]);
    if (msgRes.ok) setMessages(msgRes.data?.messages ?? []);
    if (dealRes.ok) setDeal(dealRes.data?.deal ?? null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Live updates straight from Postgres. The messages table is the source of
   * truth (the API just reads and writes it), so a Realtime subscription on
   * the row insert is the whole feature — no polling, no extra service.
   */
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id]);

  async function send() {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setDraft('');

    const res = await endpoints.sendMessage<{ message: Message }>(id, { content: body });
    setSending(false);

    if (!res.ok) {
      // Put the text back rather than losing what they typed.
      setDraft(body);
      return;
    }
    const sent = res.data?.message;
    if (sent) {
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
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
              backgroundColor: t.color.brandSoft,
              borderBottomWidth: 1,
              borderBottomColor: t.color.hairline,
            }}
          >
            <Handshake size={17} color={t.color.brand} />
            <Txt variant="footnote" style={{ flex: 1, color: t.color.brandStrong }} numberOfLines={1}>
              {deal.status === 'agreed' ? 'Terms agreed' : 'Negotiating'}
              {deal.budget ? ` · ${formatCurrency(deal.budget)}` : ''}
            </Txt>
            <ChevronRight size={16} color={t.color.brand} />
          </View>
        </Pressable>
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
          placeholder="Write a message"
          multiline
          style={{ minHeight: 44, maxHeight: 120 }}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim() ? t.color.brand : t.color.hairlineStrong,
          }}
        >
          <SendHorizontal size={19} color={t.color.white} />
        </Pressable>
      </View>

      <Sheet ref={dealSheet} title="Deal terms">
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

        <Txt variant="footnote" tone="muted">
          Nothing is committed until you both approve a project. Agree the scope
          here first.
        </Txt>

        {deal?.project_id ? (
          <Button
            label="Open the project"
            onPress={() => {
              dealSheet.current?.close();
              router.push(`/projects/${deal.project_id}`);
            }}
          />
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
