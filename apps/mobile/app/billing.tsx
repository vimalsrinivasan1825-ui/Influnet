/**
 * Plan & billing — the mobile twin of apps/web/src/app/dashboard/billing.
 *
 * Shows the caller's current plan, their usage against each Free ceiling, a
 * plain Free-vs-Pro list built from the SERVER's `freeLimits` (never hard-coded
 * numbers — they live in billing_settings so they can change without a ship),
 * and an Upgrade button that runs the in-app Razorpay checkout.
 *
 * Renders nothing plan-related when `subscriptionsEnabled` is false: paid plans
 * do not exist in that deployment and a locked door nobody can open is worse
 * than no door.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { BadgeCheck, Check, Sparkles } from 'lucide-react-native';
import { formatPrice, type Entitlements } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useEntitlements } from '@/lib/use-entitlements';
import { useUpgrade } from '@/lib/use-upgrade';
import {
  Button,
  Card,
  EmptyState,
  ScreenScroll,
  SectionLabel,
  Txt,
} from '@/components/ui';

// Gold palette — mirrors the web upgrade card (#FDF8EC → #F6E9CC ground,
// #C98C13 / #8A5A08 ink, #E0C99B edge).
const GOLD = {
  from: '#FDF8EC',
  via: '#FBF3E4',
  to: '#F3DFB0',
  edge: '#E0C99B',
  ink: '#4A3405',
  inkSoft: '#6B4A05',
  accent: '#8A5A08',
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface MeterDef {
  key: keyof Entitlements['usage'];
  limitKey: keyof Entitlements['limits'];
  label: string;
}

// Only meters whose limit is a real number AND whose usage is > 0-relevant get
// drawn — a creator account has 0 of everything project-shaped by design
// (billing-meters-business-only), so an all-zero list is just hidden.
const METERS: MeterDef[] = [
  { key: 'activeProjects', limitKey: 'activeProjects', label: 'Active projects' },
  { key: 'projectConversions', limitKey: 'projectConversions', label: 'Projects converted, ever' },
  { key: 'liveCampaigns', limitKey: 'liveCampaigns', label: 'Live campaigns' },
];

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const t = useTheme();
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const atCap = used >= limit;
  const near = !atCap && pct >= 75;
  const color = atCap ? t.color.danger : near ? t.color.warn : t.color.brand;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="footnote" tone="soft">{label}</Txt>
        <Txt variant="footnote" style={{ color, fontWeight: '700' }}>
          {used} of {limit}
        </Txt>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: t.color.surfaceMuted,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${Math.max(pct, used > 0 ? 6 : 0)}%`,
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

function freeList(limits: Entitlements['freeLimits']): string[] {
  const n = (v: number | null) => (v === null ? 'Unlimited' : v);
  return [
    'Run campaigns end to end',
    'Unlimited collaboration requests',
    'Messaging, sign-off and payments',
    `${n(limits.activeProjects)} active project${limits.activeProjects === 1 ? '' : 's'} at once`,
    limits.projectConversions === null
      ? 'Unlimited project conversions'
      : `${limits.projectConversions} projects converted from a request, ever`,
    limits.analyticsDays === null
      ? 'Full analytics history'
      : `${limits.analyticsDays}-day analytics history`,
  ];
}

const PRO_LIST = [
  'Unlimited active projects & conversions',
  'Browse & filter creators by niche, location, reach',
  'Audience demographics & engagement data',
  'Creator contact details & rates',
  'Full analytics history, with export',
  'Gold verified badge',
];

/**
 * A gold surface with a slow one-pass sheen — the mobile answer to the web's
 * `.pro-shine`. SVG gradient (react-native-svg is already a dep) + a reanimated
 * highlight that sweeps across every few seconds and rests.
 */
function GoldPanel({ children, style }: { children: React.ReactNode; style?: object }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduced = useReducedMotion();
  const x = useSharedValue(-0.4);

  useEffect(() => {
    if (reduced || size.w === 0) return;
    x.value = withDelay(
      900,
      withRepeat(withTiming(1.4, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, false),
    );
  }, [reduced, size.w, x]);

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value * size.w }, { skewX: '-16deg' }],
    opacity: x.value > 0 && x.value < 1.1 ? 0.55 : 0,
  }));

  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((p) => (p.w === width && p.h === height ? p : { w: width, h: height }));
      }}
      style={[
        {
          borderRadius: 20,
          borderWidth: 1,
          borderColor: GOLD.edge,
          overflow: 'hidden',
          padding: 18,
          gap: 12,
          backgroundColor: GOLD.from,
        },
        style,
      ]}
    >
      {size.w > 0 && (
        <Svg width={size.w} height={size.h} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <SvgGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={GOLD.from} />
              <Stop offset="0.55" stopColor={GOLD.via} />
              <Stop offset="1" stopColor={GOLD.to} />
            </SvgGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#gold)" />
        </Svg>
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: -20, bottom: -20, left: 0, width: size.w * 0.28, backgroundColor: '#FFFFFF' },
          sheenStyle,
        ]}
      />
      {children}
    </View>
  );
}

/** The subscribed-user card: status, this billing period, days left. */
function ProCard({ ent }: { ent: Entitlements }) {
  const now = Date.now();
  const end = ent.currentPeriodEnd ? new Date(ent.currentPeriodEnd).getTime() : null;
  // The subscription row carries no period-start, and one payment buys a fixed
  // 30 days (PRO_PERIOD_DAYS in lib/payments/subscription.ts) — so the start is
  // arithmetic from the end.
  const start = end ? end - 30 * 86_400_000 : null;
  const daysLeft = end ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : null;
  const inGrace = !!ent.graceUntil && new Date(ent.graceUntil).getTime() > now && (!end || end <= now);

  return (
    <GoldPanel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Sparkles size={18} color={GOLD.accent} />
        <Txt variant="title3" style={{ color: GOLD.ink }}>Influnet Pro</Txt>
        <View
          style={{
            marginLeft: 'auto',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.65)',
            borderWidth: 1,
            borderColor: GOLD.edge,
          }}
        >
          <Txt variant="caption" style={{ color: GOLD.accent, fontWeight: '800' }}>
            {inGrace ? 'GRACE' : ent.cancelAtPeriodEnd ? 'ENDING' : 'ACTIVE'}
          </Txt>
        </View>
      </View>

      <Txt variant="footnote" style={{ color: GOLD.inkSoft }}>
        Everything is unlocked.
        {ent.cancelAtPeriodEnd ? ' Your plan will not renew.' : ''}
      </Txt>

      <View style={{ gap: 4, borderTopWidth: 1, borderTopColor: 'rgba(224,201,155,0.6)', paddingTop: 10 }}>
        {start && end && (
          <Row label="This billing period" value={`${fmtDate(new Date(start).toISOString())} → ${fmtDate(new Date(end).toISOString())}`} />
        )}
        {daysLeft !== null && (
          <Row
            label={ent.cancelAtPeriodEnd ? 'Access ends in' : 'Renews in'}
            value={daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
          />
        )}
        {inGrace && ent.graceUntil && (
          <Row label="Grace period until" value={fmtDate(ent.graceUntil) ?? '—'} />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <BadgeCheck size={14} color={GOLD.accent} />
        <Txt variant="caption" style={{ color: GOLD.accent, fontWeight: '700' }}>
          Gold verified badge active
        </Txt>
      </View>
    </GoldPanel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt variant="caption" style={{ color: GOLD.inkSoft }}>{label}</Txt>
      <Txt variant="caption" style={{ color: GOLD.ink, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Txt>
    </View>
  );
}

export default function BillingScreen() {
  const t = useTheme();
  const { entitlements, loading, isPro, enabled, refresh } = useEntitlements();
  const { upgrade, busy } = useUpgrade();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  async function onUpgrade() {
    const outcome = await upgrade();
    switch (outcome.status) {
      case 'paid':
        Alert.alert(
          'Payment received',
          'Your upgrade is being confirmed — this usually takes a few seconds.',
        );
        refresh();
        break;
      case 'already_pro':
        Alert.alert('You are already on Pro', 'Nothing to do here.');
        refresh();
        break;
      case 'failed':
        Alert.alert('Payment not completed', outcome.message);
        break;
      case 'unavailable':
        Alert.alert('Upgrade unavailable', outcome.message);
        break;
      case 'cancelled':
      default:
        break;
    }
  }

  if (loading && !entitlements) {
    return (
      <ScreenScroll>
        <Txt tone="muted">Loading your plan…</Txt>
      </ScreenScroll>
    );
  }

  if (!enabled || !entitlements) {
    return (
      <ScreenScroll>
        <EmptyState
          title="Plans aren't available yet"
          body="Everything is unlocked on this build."
        />
      </ScreenScroll>
    );
  }

  const { limits, usage } = entitlements;
  const meters = METERS.filter((m) => typeof limits[m.limitKey] === 'number');

  return (
    <ScreenScroll
      contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.xl }}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await Promise.resolve(refresh());
        setRefreshing(false);
      }}
    >
      {/* Current plan */}
      {isPro ? (
        <ProCard ent={entitlements} />
      ) : (
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color={t.color.contentMuted} />
            <Txt variant="title3">Free plan</Txt>
          </View>
          <Txt tone="soft" variant="footnote">
            You&apos;re on the Free plan. Upgrade for unlimited projects, creator
            discovery and audience data.
          </Txt>

          {meters.length > 0 && (
            <View style={{ gap: t.spacing.md, marginTop: 4 }}>
              {meters.map((m) => (
                <Meter
                  key={m.key}
                  label={m.label}
                  used={Number(usage[m.key] ?? 0)}
                  limit={Number(limits[m.limitKey])}
                />
              ))}
            </View>
          )}
        </Card>
      )}

      {!isPro && (
        <Button
          label={busy ? 'Opening checkout…' : `Upgrade to Pro — ${formatPrice(entitlements.price.paise, entitlements.price.currency)}/mo`}
          onPress={onUpgrade}
          loading={busy}
          icon={<Sparkles size={18} color={t.color.white} />}
        />
      )}

      {/* What Free includes */}
      <View style={{ gap: t.spacing.sm }}>
        <SectionLabel>What Free includes</SectionLabel>
        <Card style={{ gap: 10 }}>
          {freeList(entitlements.freeLimits).map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8 }}>
              <Check size={15} color={t.color.ok} style={{ marginTop: 3 }} />
              <Txt variant="footnote" tone="soft" style={{ flex: 1 }}>{f}</Txt>
            </View>
          ))}
        </Card>
      </View>

      {/* What Pro adds / your benefits */}
      <View style={{ gap: t.spacing.sm }}>
        <SectionLabel>{isPro ? 'Your Pro benefits' : 'What Pro adds'}</SectionLabel>
        <GoldPanel style={{ gap: 10, padding: 16 }}>
          {PRO_LIST.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8 }}>
              <Check size={15} color={GOLD.accent} style={{ marginTop: 3 }} />
              <Txt variant="footnote" style={{ flex: 1, color: GOLD.inkSoft }}>{f}</Txt>
            </View>
          ))}
        </GoldPanel>
      </View>

      <Txt variant="caption" tone="muted" center>
        Secure payment by Razorpay · Cancel any time
      </Txt>
    </ScreenScroll>
  );
}
