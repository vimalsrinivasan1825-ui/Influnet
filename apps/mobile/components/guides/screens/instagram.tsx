import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { LOGO_SOURCE } from '@/components/brand/logo';
import { Avatar, Fill, Key, StatusBar, Tap, Tick, TT, type GuideContext } from './kit';

export function PhoneHome() {
  return (
    <View style={{ flex: 1 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#6d5bd0' }]} />
      <StatusBar dark />
      <View style={s.grid}>
        <Tile bg="#3b9ee8" />
        <Tile bg="#2fb384" />
        <Tile bg="#e8a93b" />
        <Tile bg="#e0574f" />
        <Tap id="ig-icon" style={s.appTile}>
          <View style={[s.tileSq, { backgroundColor: '#c23c8f' }]}>
            <View style={s.igOuter}>
              <View style={s.igInner} />
            </View>
          </View>
          <TT size={7.5} weight="600" style={{ color: '#fff' }}>
            Instagram
          </TT>
        </Tap>
        <Tap id="inf-icon" style={s.appTile}>
          <View style={[s.tileSq, { backgroundColor: '#fff' }]}>
            <Image source={LOGO_SOURCE} style={{ width: 24, height: 24 }} contentFit="contain" />
          </View>
          <TT size={7.5} weight="600" style={{ color: '#fff' }}>
            Influnet
          </TT>
        </Tap>
        <Tile bg="#8b6ee0" />
        <Tile bg="#7c8a9c" />
      </View>
    </View>
  );
}

export function IgProfile({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surfaceCard }}>
      <StatusBar />
      <View style={[s.hdr, { borderColor: t.color.hairline }]}>
        <TT weight="800" size={11.5}>
          {ctx.handle}
        </TT>
        <TT tone="soft" size={13}>
          ☰
        </TT>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 }}>
        <Avatar size={46} uri={ctx.avatarUrl} />
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          <Stat n="248" l="posts" />
          <Stat n="48.2K" l="followers" />
          <Stat n="612" l="following" />
        </View>
      </View>
      <View style={{ paddingHorizontal: 12 }}>
        <TT weight="800" size={10}>
          {ctx.name}
        </TT>
        <TT size={9.5}>Food &amp; travel creator</TT>
      </View>
      <Tap
        id="ig-edit-btn"
        style={[s.editBtn, { backgroundColor: t.color.surfaceMuted, borderColor: t.color.hairlineStrong }]}
      >
        <TT weight="700" size={10}>
          Edit profile
        </TT>
      </Tap>
      <View style={s.thumbs}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[s.thumb, { backgroundColor: t.color.hairlineStrong }]} />
        ))}
      </View>
    </View>
  );
}

export function IgEdit({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surfaceCard }}>
      <StatusBar />
      <View style={[s.hdr, { borderColor: t.color.hairline, justifyContent: 'space-between' }]}>
        <TT tone="soft" size={13}>
          ✕
        </TT>
        <TT weight="800" size={11.5}>
          Edit profile
        </TT>
        <Tap id="ig-done">
          <TT weight="800" size={11} style={{ color: '#0095f6' }}>
            Done
          </TT>
        </Tap>
      </View>
      <EditRow label="Name" value={ctx.name} />
      <EditRow label="Username" value={ctx.handle} />
      <EditRow label="Bio" value="Food & travel creator, Chennai" />
      <Tap id="ig-links-row" style={[s.editItem, { borderColor: t.color.hairline }]}>
        <Key>Links</Key>
        <Fill id="ig-links-row" placeholder="Add link" size={9.5} />
      </Tap>
    </View>
  );
}

export function InfVerify({ ctx }: { ctx: GuideContext }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.color.surface }}>
      <StatusBar />
      <View style={{ paddingHorizontal: 12, gap: 6, paddingTop: 4 }}>
        <TT weight="700" size={12}>
          Verify your Instagram
        </TT>
        <View style={[s.idRow, { backgroundColor: t.color.surfaceCard, borderColor: t.color.hairline }]}>
          <Avatar size={20} uri={ctx.avatarUrl} />
          <View style={{ flex: 1 }}>
            <TT weight="700" size={10}>
              {ctx.name}
            </TT>
            <TT tone="muted" size={8.5}>
              @{ctx.handle}
            </TT>
          </View>
        </View>

        <Tap id="link-card" style={[s.card, { marginHorizontal: 0, backgroundColor: t.color.surfaceCard, borderColor: t.color.hairline }]}>
          <Key>Your profile link</Key>
          <View style={[s.codeBox, { backgroundColor: t.color.surfaceMuted, borderColor: t.color.hairlineStrong }]}>
            <TT weight="600" size={9.5}>
              {ctx.displayUrl}
            </TT>
          </View>
          <Tap id="copy-btn" style={[s.miniBtn, { borderColor: t.color.hairlineStrong, backgroundColor: t.color.surfaceCard }]}>
            <TT weight="700" size={10.5}>
              Copy link
            </TT>
          </Tap>
        </Tap>

        <Tap id="verify-btn" style={[s.miniBtn, { backgroundColor: t.color.brand }]}>
          <TT weight="700" size={10.5} style={{ color: '#fff' }}>
            I&apos;ve added the link
          </TT>
        </Tap>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          <Tick size={10} />
          <TT tone="muted" size={8.5} weight="600">
            Verification keeps your profile trusted
          </TT>
        </View>
      </View>
    </View>
  );
}

function EditRow({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={[s.editItem, { borderColor: t.color.hairline }]}>
      <Key>{label}</Key>
      <TT size={10.5}>{value}</TT>
    </View>
  );
}
function Stat({ n, l }: { n: string; l: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <TT weight="800" size={12}>
        {n}
      </TT>
      <TT tone="soft" size={8.5}>
        {l}
      </TT>
    </View>
  );
}
function Tile({ bg }: { bg: string }) {
  return (
    <View style={s.appTile}>
      <View style={[s.tileSq, { backgroundColor: bg }]} />
    </View>
  );
}

const s = StyleSheet.create({
  grid: { position: 'absolute', top: 44, left: 16, right: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  appTile: { width: '21%', alignItems: 'center', gap: 4 },
  tileSq: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  igOuter: { width: 19, height: 19, borderRadius: 6, borderWidth: 2.2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  igInner: { width: 8, height: 8, borderRadius: 999, borderWidth: 2.2, borderColor: '#fff' },
  hdr: { flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 12, borderBottomWidth: 1 },
  editBtn: { marginHorizontal: 12, height: 27, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  editItem: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, gap: 2 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  thumb: { width: '33.3%', aspectRatio: 1 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 8 },
  card: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
  codeBox: { borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', marginVertical: 6 },
  miniBtn: { height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', marginTop: 6 },
});
