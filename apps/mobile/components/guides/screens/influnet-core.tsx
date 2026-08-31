import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { Avatar, Fill, Row, StatusBar, Tap, Tick, TT, type GuideContext } from './kit';

export function InfHome({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={s.topRow}>
        <TT weight="800" size={12}>
          Home
        </TT>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Tap id="home-search" style={[s.iconBtn, { backgroundColor: t.color.surfaceMuted }]}>
            <SearchGlyph color={t.color.contentSoft} />
          </Tap>
          <Tap id="act-bell" style={[s.iconBtn, { backgroundColor: t.color.surfaceMuted }]}>
            <BellGlyph color={t.color.contentSoft} />
            <View style={[s.dot, { backgroundColor: t.color.brand2 ?? t.color.brand }]} />
          </Tap>
        </View>
      </View>

      <Tap id="home-turn-card" style={[s.card, { backgroundColor: t.color.surfaceCard, borderColor: t.color.hairline }]}>
        <TT size={7.5} weight="700" style={{ color: t.color.brandStrong, textTransform: 'uppercase' }}>
          Your move
        </TT>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Avatar size={18} />
          <TT weight="700" size={10}>
            Nike India · sign off “Draft review”
          </TT>
        </View>
      </Tap>

      <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 }}>
        <Metric label="Reach" v="132K" />
        <Metric label="Views" v="21.4K" />
        <Metric label="Earned" v="₹1.2L" />
      </View>

      <Tap id="home-discover-card" style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.color.surfaceCard, borderColor: t.color.hairline }]}>
        <View style={[s.iconBtn, { backgroundColor: t.color.brandSoft }]}>
          <SearchGlyph color={t.color.brandStrong} />
        </View>
        <TT weight="700" size={10}>
          Discover creators & brands
        </TT>
      </Tap>

      <View style={[s.tabBar, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
        <TT size={7} weight="700" style={{ color: t.color.brandStrong }}>
          Home
        </TT>
        <Tap id="home-nav-messages">
          <TT size={7} weight="700" tone="muted">
            Messages
          </TT>
        </Tap>
        <Tap id="home-nav-projects">
          <TT size={7} weight="700" tone="muted">
            Projects
          </TT>
        </Tap>
        <TT size={7} weight="700" tone="muted">
          Profile
        </TT>
      </View>
    </View>
  );
}

export function InfDiscover({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={{ padding: 10, gap: 8 }}>
        <Tap id="discover-search" style={[s.searchField, { borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceMuted }]}>
          <SearchGlyph color={t.color.contentMuted} />
          <Fill id="discover-search" placeholder="Search people…" size={9.5} />
        </Tap>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Tap id="discover-filter" style={[s.pill, { borderWidth: 1, borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceCard }]}>
            <TT size={8.5} weight="700">
              Filters
            </TT>
          </Tap>
          <View style={[s.pill, { backgroundColor: t.color.surfaceMuted }]}>
            <TT size={8.5} tone="muted">
              Instagram
            </TT>
          </View>
        </View>
      </View>
      <Tap id="discover-card">
        <Row title="Aarav Menon" subtitle="Food · 88K followers · 4.1% eng." leading={<Avatar size={22} />} trailing={<Tick />} />
      </Tap>
      <Row title="Zoya Khan" subtitle="Travel · 210K followers" leading={<Avatar size={22} />} />
      <Row title="Kabir Rao" subtitle="Lifestyle · 45K followers" leading={<Avatar size={22} />} />
    </View>
  );
}

export function InfMessages({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={[s.topRow, { borderBottomWidth: 1, borderColor: t.color.hairline }]}>
        <TT weight="800" size={12}>
          Messages
        </TT>
        <Tap id="msg-new">
          <TT weight="700" size={10.5} style={{ color: t.color.brandStrong }}>
            New
          </TT>
        </Tap>
      </View>
      <Tap id="msg-search" style={[s.searchField, { margin: 10, backgroundColor: t.color.surfaceMuted, borderColor: t.color.hairline, borderWidth: 1 }]}>
        <SearchGlyph color={t.color.contentMuted} />
        <TT tone="muted" size={9}>
          Search conversations
        </TT>
      </Tap>
      <Tap id="msg-conversation">
        <Row
          title="Nike India"
          subtitle="Sounds great — let’s lock the dates"
          leading={<Avatar size={24} />}
          trailing={<View style={[s.unread, { backgroundColor: t.color.brand }]} />}
        />
      </Tap>
      <Row title="Aarav Menon" subtitle="Thanks! Sending the brief now" leading={<Avatar size={24} />} />
      <Row title="Zoya Khan" subtitle="You: is next week okay?" leading={<Avatar size={24} />} />
    </View>
  );
}

export function InfChat({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={[s.chatHdr, { borderColor: t.color.hairline }]}>
        <View style={[s.chevSm, { borderColor: t.color.contentSoft }]} />
        <Avatar size={18} />
        <TT weight="800" size={10.5}>
          Nike India
        </TT>
      </View>

      <Tap id="chat-deal-bar" style={[s.dealBar, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
        <View style={[s.dotSm, { backgroundColor: t.color.brand }]} />
        <TT weight="700" size={8.5}>
          Deal: discussing terms
        </TT>
        <Tap id="chat-propose-btn" style={[s.tinyBtn, { backgroundColor: t.color.brand }]}>
          <TT size={8} weight="700" style={{ color: '#fff' }}>
            Propose project
          </TT>
        </Tap>
      </Tap>

      <View style={{ flex: 1, padding: 10, gap: 6 }}>
        <Bubble side="in" text="Loved your last reel — open to a collab?" />
        <Bubble side="out" text="Yes! What are you thinking?" />
      </View>

      <View style={[s.composer, { borderColor: t.color.hairline }]}>
        <Tap id="chat-attach" style={[s.iconBtn, { backgroundColor: t.color.surfaceMuted }]}>
          <TT tone="soft">+</TT>
        </Tap>
        <Tap id="chat-input" style={[s.inputPill, { borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceMuted }]}>
          <Fill id="chat-input" placeholder="Message…" size={9.5} />
        </Tap>
        <Tap id="chat-send" style={[s.sendBtn, { backgroundColor: t.color.brand }]}>
          <SendGlyph />
        </Tap>
      </View>
    </View>
  );
}

function Bubble({ side, text }: { side: 'in' | 'out'; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: side === 'out' ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: '82%',
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingVertical: 4,
          backgroundColor: side === 'out' ? t.color.brand : t.color.surfaceMuted,
        }}
      >
        <TT size={9} style={{ color: side === 'out' ? '#fff' : t.color.content }}>
          {text}
        </TT>
      </View>
    </View>
  );
}
function Metric({ label, v }: { label: string; v: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard, padding: 6 }}>
      <TT size={6.5} weight="700" tone="muted" style={{ textTransform: 'uppercase' }}>
        {label}
      </TT>
      <TT size={11} weight="800">
        {v}
      </TT>
    </View>
  );
}
function SearchGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={color} strokeWidth={2.4} />
      <Path d="m20 20-3.5-3.5" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}
function BellGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M10 20a2 2 0 0 0 4 0" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function SendGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M4 12 20 4l-4 16-4-7-8-1Z" fill="#fff" />
    </Svg>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  iconBtn: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: -1, right: -1, width: 6, height: 6, borderRadius: 3 },
  card: { marginHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, padding: 10 },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, paddingVertical: 6 },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, borderRadius: 8, paddingHorizontal: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  unread: { width: 8, height: 8, borderRadius: 4 },
  chatHdr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1 },
  chevSm: { width: 7, height: 7, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }] },
  dealBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  dotSm: { width: 6, height: 6, borderRadius: 3 },
  tinyBtn: { marginLeft: 'auto', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
  inputPill: { flex: 1, height: 24, borderRadius: 999, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 10 },
  sendBtn: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
