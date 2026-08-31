import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Fill, Key, PrimaryBtn, Row, StatusBar, Tap, TopBar, Tick, TT, type GuideContext } from './kit';

export function InfProfileEditor({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar
        title="Edit profile"
        trailing={
          <Tap id="pe-save">
            <TT weight="800" size={10} style={{ color: t.color.brandStrong }}>
              Save
            </TT>
          </Tap>
        }
      />
      <View style={{ alignItems: 'center', paddingVertical: 8, gap: 3 }}>
        <Tap id="pe-avatar">
          <Avatar size={40} uri={ctx.avatarUrl} />
        </Tap>
        <TT size={8.5} weight="600" style={{ color: t.color.brandStrong }}>
          Change photo
        </TT>
      </View>
      <Tap id="pe-bio" style={[s.item, { borderColor: t.color.hairline }]}>
        <Key>Bio</Key>
        <Fill id="pe-bio" placeholder="Tell brands what you make…" size={10} />
      </Tap>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
        <Key>Platforms</Key>
        <Tap id="pe-connect-ig" style={[s.platform, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <View style={[s.pIcon, { backgroundColor: '#c23c8f' }]} />
          <TT weight="700" size={9.5}>
            Instagram
          </TT>
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Tick size={9} />
            <TT size={8} weight="700" style={{ color: t.color.brandStrong }}>
              Connected
            </TT>
          </View>
        </Tap>
        <Tap id="pe-connect-yt" style={[s.platform, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <View style={[s.pIcon, { backgroundColor: '#ff0000' }]} />
          <TT weight="700" size={9.5}>
            YouTube
          </TT>
          <View style={{ marginLeft: 'auto' }}>
            <Fill id="pe-connect-yt" placeholder="Connect" size={8} />
          </View>
        </Tap>
      </View>
      <Tap id="pe-add-portfolio" style={[s.addWork, { borderColor: t.color.hairlineStrong }]}>
        <TT size={9.5} weight="700" tone="soft">
          + Add past work
        </TT>
      </Tap>
    </View>
  );
}

export function InfPublicProfile({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={[s.ppHdr, { borderColor: t.color.hairline }]}>
        <View style={[s.chev, { borderColor: t.color.contentSoft }]} />
        <Tap id="pp-overflow">
          <TT tone="soft" size={14}>
            ⋯
          </TT>
        </Tap>
      </View>
      <View style={{ alignItems: 'center', gap: 2, paddingTop: 8 }}>
        <Avatar size={42} uri={ctx.avatarUrl} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <TT weight="800" size={12}>
            {ctx.name}
          </TT>
          <Tap id="pp-verified-badge">
            <Tick size={12} />
          </Tap>
        </View>
        <TT tone="muted" size={8.5}>
          @{ctx.handle} · {ctx.displayUrl}
        </TT>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 }}>
        <Tap id="pp-message-btn" style={[s.msgBtn, { backgroundColor: t.color.brand }]}>
          <TT weight="700" size={10} style={{ color: '#fff' }}>
            Message
          </TT>
        </Tap>
        <View style={[s.likeBtn, { borderColor: t.color.hairlineStrong }]}>
          <TT tone="soft">♡</TT>
        </View>
      </View>
      <View style={[s.menu, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
        <Tap id="pp-report" style={[s.menuItem, { borderColor: t.color.hairline }]}>
          <TT size={9.5} weight="600">
            Report this profile
          </TT>
        </Tap>
        <Tap id="pp-block" style={s.menuItem}>
          <TT size={9.5} weight="600" style={{ color: t.color.danger }}>
            Block {ctx.name.split(' ')[0]}
          </TT>
        </Tap>
      </View>
    </View>
  );
}

export function InfAccountMenu({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar title="Account" />
      <Tap id="am-current" style={[s.acct, { borderColor: t.color.hairline }]}>
        <Avatar size={28} uri={ctx.avatarUrl} />
        <View style={{ flex: 1 }}>
          <TT weight="800" size={11}>
            {ctx.name}
          </TT>
          <TT tone="muted" size={8.5}>
            @{ctx.handle} · creator
          </TT>
        </View>
        <TT style={{ color: t.color.brandStrong }} size={10}>
          ✓
        </TT>
      </Tap>
      <View style={{ padding: 6 }}>
        <Tap id="am-other-account" style={s.acctRow}>
          <Avatar size={24} />
          <View style={{ flex: 1 }}>
            <TT weight="700" size={10}>
              Bright Foods
            </TT>
            <TT tone="muted" size={8}>
              hello@brightfoods.in · brand
            </TT>
          </View>
        </Tap>
        <Tap id="am-add-account" style={s.acctRow}>
          <View style={[s.plus, { backgroundColor: t.color.surfaceMuted }]}>
            <TT size={12}>+</TT>
          </View>
          <Fill id="am-add-account" placeholder="Add another account" size={10} />
        </Tap>
      </View>
      <View style={{ borderTopWidth: 1, borderColor: t.color.hairline, padding: 6 }}>
        <Tap id="am-settings" style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
          <TT size={10} weight="600" tone="soft">
            Settings
          </TT>
        </Tap>
      </View>
    </View>
  );
}

export function InfBilling({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar title="Plan & billing" />
      <View style={{ padding: 10, gap: 8 }}>
        <Tap id="bill-pro-card" style={[s.proCard, { borderColor: t.color.brand, backgroundColor: t.color.brandSoft }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TT weight="800" size={11}>
              Influnet Pro
            </TT>
            <TT weight="800" size={11} style={{ color: t.color.brandStrong }}>
              ₹499/mo
            </TT>
          </View>
          <Tap id="bill-feature">
            <TT size={9}>✓ Unlimited projects & requests</TT>
          </Tap>
          <TT size={9}>✓ Priority in brand search</TT>
          <TT size={9}>✓ Full audience analytics</TT>
        </Tap>
        <Tap id="bill-upgrade-btn" style={[s.upgrade, { backgroundColor: t.color.brand }]}>
          <TT weight="700" size={10.5} style={{ color: '#fff' }}>
            Upgrade to Pro
          </TT>
        </Tap>
        <TT size={8} tone="muted" style={{ textAlign: 'center' }}>
          Cancel anytime · billed monthly
        </TT>
        <View style={[s.freeNote, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <TT size={8.5} tone="muted">
            Free plan: 5 projects lifetime · you’ve used 3
          </TT>
        </View>
      </View>
    </View>
  );
}

export function InfActivity({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar title="Activity" />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Tap id="act-filter" style={[s.fPill, { borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceCard }]}>
          <TT size={8} weight="700">
            All
          </TT>
        </Tap>
        <View style={[s.fPill, { backgroundColor: t.color.surfaceMuted }]}>
          <TT size={8} tone="muted">
            Projects
          </TT>
        </View>
        <View style={[s.fPill, { backgroundColor: t.color.surfaceMuted }]}>
          <TT size={8} tone="muted">
            Payments
          </TT>
        </View>
      </View>
      <Tap id="act-item">
        <Row
          title="Nike India signed off “Concept”"
          subtitle="Your move: upload the draft · 2h ago"
          leading={
            <View style={[s.dot, { backgroundColor: t.color.brandSoft }]}>
              <TT size={9}>✓</TT>
            </View>
          }
        />
      </Tap>
      <Row
        title="Payment received · ₹20,000"
        subtitle="Advance for March launch · 1d ago"
        leading={
          <View style={[s.dot, { backgroundColor: t.color.okSoft }]}>
            <TT size={9}>₹</TT>
          </View>
        }
      />
      <Row title="Zoya Khan sent a request" subtitle="Summer haul · 2d ago" leading={<Avatar size={20} />} />
    </View>
  );
}

export function InfSupport({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar
        title="Help & support"
        trailing={
          <Tap id="sup-feedback-btn">
            <TT size={9} weight="700" style={{ color: t.color.brandStrong }}>
              Feedback
            </TT>
          </Tap>
        }
      />
      <View style={{ padding: 10, gap: 8 }}>
        <Tap id="sup-new-ticket" style={[s.newTicket, { borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceCard }]}>
          <TT size={9.5} weight="700">
            + New conversation
          </TT>
        </Tap>
        <Tap id="sup-message" style={[s.box, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <Key>What’s going on?</Key>
          <Fill id="sup-message" placeholder="Describe the problem…" size={9.5} />
        </Tap>
        <PrimaryBtn id="sup-send" label="Send to support" />
        <TT size={8} tone="muted" style={{ textAlign: 'center' }}>
          Replies come here and to your email
        </TT>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  item: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 2 },
  platform: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  pIcon: { width: 20, height: 20, borderRadius: 6 },
  addWork: { marginHorizontal: 12, height: 26, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  ppHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30, paddingHorizontal: 12, borderBottomWidth: 1 },
  chev: { width: 7, height: 7, borderLeftWidth: 2, borderBottomWidth: 2, transform: [{ rotate: '45deg' }] },
  msgBtn: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  likeBtn: { width: 26, height: 26, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  menu: { marginHorizontal: 12, marginTop: 8, borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  menuItem: { paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1 },
  acct: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  plus: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  proCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
  upgrade: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  freeNote: { borderWidth: 1, borderRadius: 8, padding: 8 },
  fPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  newTicket: { height: 26, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  box: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 3 },
});
