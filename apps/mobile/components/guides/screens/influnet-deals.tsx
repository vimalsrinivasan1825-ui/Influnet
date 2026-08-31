import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Avatar, Fill, Key, PrimaryBtn, Row, StatusBar, Tap, TopBar, TT, type GuideContext } from './kit';

export function InfRequest({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar title="Send a request" />
      <View style={{ padding: 10, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Avatar size={20} />
          <TT weight="700" size={10}>
            To: Aarav Menon
          </TT>
        </View>
        <Tap id="req-message" style={[s.box, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <Key>What’s the collaboration?</Key>
          <Fill id="req-message" placeholder="Deliverables, platforms, dates…" size={9.5} />
        </Tap>
        <Tap id="req-budget" style={[s.box, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <Key>Budget</Key>
          <Fill id="req-budget" placeholder="₹ —" size={10} />
        </Tap>
        <PrimaryBtn id="req-send" label="Send request" />
      </View>
      <View style={{ borderTopWidth: 1, borderColor: t.color.hairline, paddingTop: 4 }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
          <Key>Incoming</Key>
        </View>
        <Tap id="req-card">
          <Row
            title="Nike India"
            subtitle="1 reel + 3 stories · ₹40,000 · March"
            leading={<Avatar size={22} />}
            trailing={
              <Tap id="req-accept" style={[s.tinyBtn, { backgroundColor: t.color.brand }]}>
                <TT size={8} weight="700" style={{ color: '#fff' }}>
                  Review
                </TT>
              </Tap>
            }
          />
        </Tap>
      </View>
    </View>
  );
}

export function InfProjects({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={[s.hdr, { borderColor: t.color.hairline }]}>
        <TT weight="800" size={12}>
          Projects
        </TT>
        <View style={[s.pill, { backgroundColor: t.color.surfaceMuted }]}>
          <TT size={8} weight="700" tone="muted">
            2 live
          </TT>
        </View>
      </View>
      <Tap id="proj-card" style={[s.card, { backgroundColor: t.color.surfaceCard, borderColor: t.color.hairline }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[s.emoji, { backgroundColor: t.color.brandSoft }]}>
            <TT size={11}>🎬</TT>
          </View>
          <View style={{ flex: 1 }}>
            <TT weight="800" size={10.5}>
              Nike India · March launch
            </TT>
            <TT tone="muted" size={8.5}>
              Stage 4 of 12 · Draft review
            </TT>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <View
                key={i}
                style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: i < 4 ? t.color.brand : t.color.hairlineStrong }}
              />
            ))}
          </View>
          <Tap id="proj-stage-pill" style={[s.tinyBtn, { backgroundColor: t.color.brand }]}>
            <TT size={7.5} weight="700" style={{ color: '#fff' }}>
              Your move
            </TT>
          </Tap>
        </View>
        <Tap id="proj-open" style={[s.openBtn, { borderColor: t.color.hairlineStrong }]}>
          <TT weight="700" size={9.5}>
            Open project
          </TT>
        </Tap>
      </Tap>
      <Row
        title="Zoya Khan · Summer haul"
        subtitle="Stage 8 of 12 · Their move"
        leading={
          <View style={[s.emoji, { backgroundColor: t.color.surfaceMuted }]}>
            <TT size={11}>👜</TT>
          </View>
        }
      />
    </View>
  );
}

export function InfStage({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <TopBar title="Draft review" trailing={<TT size={8} weight="700" tone="muted">4 / 12</TT>} />
      <View style={{ padding: 10, gap: 8 }}>
        <TT size={9} tone="soft">
          The brand reviews the draft and either approves it or asks for changes.
        </TT>
        <Tap id="stage-checklist-item" style={[s.checkItem, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <View style={[s.checkbox, { borderColor: t.color.hairlineStrong }]}>
            <TT size={7}>✓</TT>
          </View>
          <TT size={9.5}>Creator uploads the draft</TT>
        </Tap>
        <View style={[s.checkItem, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <View style={[s.checkbox, { borderColor: t.color.hairlineStrong }]} />
          <TT size={9.5} tone="muted">
            Brand leaves feedback
          </TT>
        </View>
        <Tap id="stage-upload" style={[s.uploadBtn, { borderColor: t.color.hairlineStrong }]}>
          <TT size={9.5} weight="700" tone="soft">
            + Upload draft
          </TT>
        </Tap>
        <Tap id="stage-note" style={[s.box, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <Key>Note to the other side</Key>
          <Fill id="stage-note" placeholder="Optional…" size={9.5} />
        </Tap>
        <PrimaryBtn id="stage-signoff-btn" label="Sign off this stage" />
        <TT size={8} tone="muted" style={{ textAlign: 'center' }}>
          Both sides must sign off to advance
        </TT>
      </View>
    </View>
  );
}

export function InfPayment({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={{ alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: t.color.hairline }}>
        <TT weight="800" size={11}>
          Pay securely
        </TT>
      </View>
      <View style={{ padding: 10, gap: 8 }}>
        <View style={[s.amountCard, { borderColor: t.color.hairline, backgroundColor: t.color.surfaceCard }]}>
          <Key>Advance payment</Key>
          <Tap id="pay-amount">
            <TT weight="800" size={18}>
              ₹20,000
            </TT>
          </Tap>
          <TT tone="muted" size={8}>
            50% of the agreed ₹40,000
          </TT>
        </View>
        <Tap id="pay-method" style={[s.method, { borderColor: t.color.brand, backgroundColor: t.color.brandSoft }]}>
          <View style={[s.radioOn, { backgroundColor: t.color.brand }]} />
          <TT weight="700" size={9.5}>
            UPI
          </TT>
        </Tap>
        <View style={[s.method, { borderColor: t.color.hairline }]}>
          <View style={[s.radioOff, { borderColor: t.color.hairlineStrong }]} />
          <TT tone="muted" size={9.5}>
            Card · Net banking
          </TT>
        </View>
        <Tap id="pay-confirm" style={[s.payBtn, { backgroundColor: t.color.brand }]}>
          <TT weight="700" size={10.5} style={{ color: '#fff' }}>
            Pay ₹20,000
          </TT>
        </Tap>
        <TT size={8} tone="muted" style={{ textAlign: 'center' }}>
          🔒 Held safely · released on delivery
        </TT>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  box: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 3 },
  tinyBtn: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  card: { marginHorizontal: 12, marginTop: 8, borderRadius: 12, borderWidth: 1, padding: 10 },
  emoji: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  openBtn: { marginTop: 8, height: 24, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  checkbox: { width: 14, height: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: { height: 26, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  amountCard: { borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  radioOn: { width: 8, height: 8, borderRadius: 4 },
  radioOff: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  payBtn: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
