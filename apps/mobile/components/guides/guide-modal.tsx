/**
 * The guide modal (mobile). An RN Modal over the app: the player, a
 * "Step n of m" line, play/pause, and a button into the real screen the guide
 * teaches. Mounted once by <GuideRoot> in app/_layout.tsx; reads the open guide
 * from `useGuides`.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Pause, Play, X } from 'lucide-react-native';
import { captionSteps, guideById } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { publicProfileUrl, publicProfileUrlDisplay } from '@/lib/site';
import { Txt } from '@/components/ui';
import { GuidePlayer } from './guide-player';
import { DEFAULT_CONTEXT, type GuideContext } from './screens';
import { useGuides } from './use-guides';

const CTA: Record<string, { label: string; href: string }> = {
  'connect-instagram': { label: 'Verify now', href: '/verification' },
  'connect-socials': { label: 'Edit profile', href: '/edit-profile' },
  'discover-people': { label: 'Open search', href: '/search' },
  'edit-profile': { label: 'Edit my profile', href: '/edit-profile' },
  'send-message': { label: 'Open messages', href: '/(tabs)/messages' },
  'respond-request': { label: 'Open requests', href: '/(tabs)/requests' },
  'send-request': { label: 'Open requests', href: '/(tabs)/requests' },
  'propose-project': { label: 'Open messages', href: '/(tabs)/messages' },
  'run-project': { label: 'Open projects', href: '/(tabs)/projects' },
  'sign-off-stage': { label: 'Open projects', href: '/(tabs)/projects' },
  payments: { label: 'Open projects', href: '/(tabs)/projects' },
  'get-premium': { label: 'See Pro', href: '/billing' },
  'get-help': { label: 'Open support', href: '/support' },
  notifications: { label: 'Open activity', href: '/activity' },
  'add-account': { label: 'Open settings', href: '/settings' },
  'switch-account': { label: 'Open settings', href: '/settings' },
  'report-block': { label: 'Blocked accounts', href: '/blocked-accounts' },
  'verified-badge': { label: 'Verify now', href: '/verification' },
};

export function GuideModal() {
  const t = useTheme();
  const router = useRouter();
  const { openId, close } = useGuides();
  const profile = useSession((s) => s.profile);
  const script = openId ? guideById(openId) : undefined;

  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);

  const steps = useMemo(() => (script ? captionSteps(script) : []), [script]);

  useEffect(() => {
    if (openId) {
      setPlaying(true);
      setStep(0);
    }
  }, [openId]);

  const ctx: GuideContext = useMemo(() => {
    if (!profile) return DEFAULT_CONTEXT;
    const slug = profile.username ?? null;
    const handle = (profile.instagram_handle ?? slug ?? DEFAULT_CONTEXT.handle).replace(/^@/, '');
    return {
      name: profile.name ?? DEFAULT_CONTEXT.name,
      handle,
      avatarUrl: profile.avatar_url ?? null,
      profileUrl: slug ? publicProfileUrl(slug) : DEFAULT_CONTEXT.profileUrl,
      displayUrl: slug ? publicProfileUrlDisplay(slug) : DEFAULT_CONTEXT.displayUrl,
      role: profile.role ?? DEFAULT_CONTEXT.role,
      plan: profile.is_verified ? 'pro' : 'free',
    };
  }, [profile]);

  if (!openId || !script) return null;
  const cta = CTA[script.id];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 20,
            overflow: 'hidden',
            backgroundColor: t.color.surfaceCard,
            borderWidth: 1,
            borderColor: t.color.hairline,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderColor: t.color.hairline,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong">{script.title}</Txt>
              <Txt variant="caption" tone="muted" numberOfLines={1}>
                {steps.length > 0
                  ? `Step ${step + 1} of ${steps.length} · ${steps[step]?.label ?? ''}`
                  : script.blurb}
              </Txt>
            </View>
            <Pressable onPress={() => setPlaying((v) => !v)} hitSlop={10} style={{ padding: 6 }}>
              {playing ? <Pause size={16} color={t.color.contentMuted} /> : <Play size={16} color={t.color.contentMuted} />}
            </Pressable>
            <Pressable onPress={close} hitSlop={10} style={{ padding: 6 }}>
              <X size={16} color={t.color.contentMuted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }}>
            <GuidePlayer script={script} context={ctx} playing={playing} onStep={setStep} />

            {steps.length > 1 ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {steps.map((sp, i) => (
                  <View
                    key={sp.at}
                    style={{
                      height: 6,
                      borderRadius: 3,
                      width: i === step ? 24 : 6,
                      backgroundColor: i === step ? t.color.brand : t.color.hairlineStrong,
                    }}
                  />
                ))}
              </View>
            ) : null}

            <View style={{ backgroundColor: t.color.surfaceMuted, borderRadius: 10, padding: 10 }}>
              <Txt variant="caption" tone="soft">
                {script.blurb}
              </Txt>
            </View>

            {cta ? (
              <Pressable
                onPress={() => {
                  close();
                  router.push(cta.href as Href);
                }}
                style={{
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: t.color.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Txt variant="bodyStrong" style={{ color: t.color.white }}>
                  {cta.label}
                </Txt>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
