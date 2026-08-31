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
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Check, Sparkles } from 'lucide-react-native';
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
import { Alert } from 'react-native';

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
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color={isPro ? '#C98C13' : t.color.contentMuted} />
          <Txt variant="title3">{isPro ? 'Influnet Pro' : 'Free plan'}</Txt>
        </View>
        {isPro ? (
          <Txt tone="soft" variant="footnote">
            {entitlements.currentPeriodEnd
              ? `Your access runs until ${new Date(entitlements.currentPeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : 'Your access is active.'}
            {entitlements.cancelAtPeriodEnd ? ' It will not renew.' : ''}
          </Txt>
        ) : (
          <Txt tone="soft" variant="footnote">
            You&apos;re on the Free plan. Upgrade for unlimited projects, creator
            discovery and audience data.
          </Txt>
        )}

        {!isPro && meters.length > 0 && (
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

      {/* What Pro adds */}
      <View style={{ gap: t.spacing.sm }}>
        <SectionLabel>{isPro ? 'Your Pro benefits' : 'What Pro adds'}</SectionLabel>
        <Card style={{ gap: 10, borderColor: '#E0C99B' }}>
          {PRO_LIST.map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8 }}>
              <Check size={15} color="#C98C13" style={{ marginTop: 3 }} />
              <Txt variant="footnote" style={{ flex: 1, color: '#5B3E05' }}>{f}</Txt>
            </View>
          ))}
        </Card>
      </View>

      <Txt variant="caption" tone="muted" center>
        Secure payment by Razorpay · Cancel any time
      </Txt>
    </ScreenScroll>
  );
}
