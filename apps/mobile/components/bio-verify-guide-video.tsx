/**
 * The animated "watch how it works" walkthrough for the bio-link ownership
 * step — a timed sequence of six mini-phone scenes (copy → open Instagram →
 * edit profile → paste into bio → save → come back and verify), each with
 * its own caption, mirroring the HTML prototype built to review this flow
 * before it shipped here.
 *
 * Driven by setInterval + Date.now() deltas, not requestAnimationFrame: the
 * prototype's first version used rAF and silently froze the instant the tab
 * lost focus, because browsers (and, the same way, a backgrounded RN app)
 * suspend animation-frame callbacks outright rather than throttling them.
 * Real elapsed time means a delayed tick catches back up to the correct
 * position instead of drifting — same fix, same reason, ported here so this
 * component doesn't reintroduce a bug already found and fixed once.
 */
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Clapperboard, Pause, Play, RotateCcw, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

interface Scene {
  at: number;
  len: number;
  n: string;
  cap: string;
}

const SCENES: Scene[] = [
  { at: 0, len: 2.0, n: 'Step 1', cap: 'In Influnet, tap "Copy link". That link is minted for your sign-up — it only proves this account.' },
  { at: 2.0, len: 1.8, n: 'Step 2', cap: 'Tap "Open Instagram". Instagram opens on your own profile.' },
  { at: 3.8, len: 1.6, n: 'Step 3', cap: 'Tap "Edit profile".' },
  { at: 5.4, len: 2.0, n: 'Step 4', cap: 'Tap the Bio field, press and hold, then choose Paste.' },
  { at: 7.4, len: 1.2, n: 'Step 5', cap: 'Save the change.' },
  { at: 8.6, len: 1.8, n: 'Step 6', cap: 'Come back to Influnet and tap "I\'ve added it — verify".' },
];
const DUR = 10.4;

function sceneIndexAt(t: number) {
  let idx = 0;
  for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i].at) idx = i;
  return idx;
}

/** Small pulsing dot standing in for a fingertip tap. */
function TapDot({ top, left }: { top: number; left: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left,
        width: 30,
        height: 30,
        borderRadius: 15,
        marginTop: -15,
        marginLeft: -15,
        backgroundColor: t.color.brandSoft,
        borderWidth: 2,
        borderColor: t.color.brand,
      }}
    />
  );
}

function MiniChrome({
  title,
  tone = 'default',
  children,
}: {
  title: string;
  tone?: 'default' | 'ok';
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 210,
        height: 380,
        borderRadius: 22,
        backgroundColor: t.color.white,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height: 30,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderColor: t.color.hairline,
        }}
      >
        <Txt variant="caption" style={{ fontWeight: '600', color: tone === 'ok' ? t.color.ok : t.color.content }}>
          {title}
        </Txt>
      </View>
      <View style={{ padding: 12, gap: 9 }}>{children}</View>
    </View>
  );
}

function MiniLabel({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Txt variant="caption" tone="muted" style={{ fontSize: 9.5 }}>
      {children}
    </Txt>
  );
}

function MiniBox({ active, children }: { active?: boolean; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: active ? t.color.brand : t.color.hairlineStrong,
        borderRadius: 8,
        padding: 8,
        minHeight: 28,
      }}
    >
      {children}
    </View>
  );
}

function MiniButton({ label, tone = 'ghost', done }: { label: string; tone?: 'ghost' | 'brand'; done?: boolean }) {
  const t = useTheme();
  const brandLike = tone === 'brand' && !done;
  return (
    <View
      style={{
        borderRadius: 8,
        padding: 8,
        alignItems: 'center',
        backgroundColor: done ? t.color.ok : brandLike ? t.color.brand : t.color.white,
        borderWidth: brandLike || done ? 0 : 1,
        borderColor: t.color.hairlineStrong,
      }}
    >
      <Txt variant="caption" style={{ fontSize: 10.5, fontWeight: '600', color: brandLike || done ? t.color.white : t.color.content }}>
        {label}
      </Txt>
    </View>
  );
}

/** Renders whichever of the 6 scenes `t` currently falls inside. */
function Stage({ t: playT, link, handle }: { t: number; link: string; handle: string }) {
  const t = useTheme();
  const idx = sceneIndexAt(playT);
  const local = playT - SCENES[idx].at;
  const cleanHandle = handle.replace(/^@/, '') || 'yourhandle';

  if (idx === 0) {
    const copied = local > 1.0;
    return (
      <View>
        <MiniChrome title="Influnet">
          <MiniLabel>1. Copy your profile link</MiniLabel>
          <MiniBox>
            <Txt variant="caption" style={{ fontSize: 10 }} numberOfLines={1}>
              {link}
            </Txt>
          </MiniBox>
          <MiniButton label={copied ? '✓ Copied' : 'Copy link'} />
        </MiniChrome>
        {local > 0.65 && local < 1.2 ? <TapDot top={112} left={105} /> : null}
      </View>
    );
  }

  if (idx === 1) {
    return (
      <MiniChrome title="Instagram">
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.color.brandSoft }} />
          <View style={{ flex: 1 }}>
            <Txt variant="caption" style={{ fontSize: 10.5, fontWeight: '700' }}>@{cleanHandle}</Txt>
            <Txt variant="caption" tone="muted" style={{ fontSize: 8.5 }}>Food & travel creator</Txt>
          </View>
        </View>
        <MiniButton label="Edit profile" />
      </MiniChrome>
    );
  }

  if (idx === 2) {
    const pressed = local > 0.55;
    return (
      <View>
        <MiniChrome title="Instagram">
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.color.brandSoft }} />
            <Txt variant="caption" style={{ fontSize: 10.5, fontWeight: '700' }}>@{cleanHandle}</Txt>
          </View>
          <MiniButton label="Edit profile" />
        </MiniChrome>
        {pressed ? <TapDot top={103} left={105} /> : null}
      </View>
    );
  }

  if (idx === 3) {
    const holding = local > 0.5 && local < 1.15;
    const pasted = local >= 1.15;
    return (
      <View>
        <MiniChrome title="Edit profile">
          <MiniLabel>Name</MiniLabel>
          <MiniBox>
            <Txt variant="caption" style={{ fontSize: 10 }}>Priya Sharma</Txt>
          </MiniBox>
          <MiniLabel>Bio</MiniLabel>
          <MiniBox active={holding || pasted}>
            <Txt variant="caption" style={{ fontSize: 9.5 }} numberOfLines={pasted ? 2 : 1}>
              Food & travel creator
              {pasted ? `\n${link}` : ''}
            </Txt>
          </MiniBox>
        </MiniChrome>
        {holding ? (
          <>
            <View
              style={{
                position: 'absolute',
                top: 140,
                left: 55,
                backgroundColor: '#2b3240',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
              }}
            >
              <Txt variant="caption" style={{ fontSize: 9, color: t.color.white }}>Paste</Txt>
            </View>
            <TapDot top={158} left={105} />
          </>
        ) : null}
      </View>
    );
  }

  if (idx === 4) {
    return (
      <MiniChrome title="✓ Saved" tone="ok">
        <MiniLabel>Bio</MiniLabel>
        <MiniBox active>
          <Txt variant="caption" tone="ok" style={{ fontSize: 9.5 }} numberOfLines={2}>
            {`Food & travel creator\n${link}`}
          </Txt>
        </MiniBox>
      </MiniChrome>
    );
  }

  const done = local > 1.0;
  return (
    <View>
      <MiniChrome title="Influnet">
        <MiniLabel>3. Check it</MiniLabel>
        <MiniButton label={done ? '✓ Verified' : "I've added it — verify"} tone="brand" done={done} />
        {done ? (
          <Txt variant="caption" tone="ok" style={{ fontSize: 9, textAlign: 'center' }}>
            @{cleanHandle} is yours
          </Txt>
        ) : null}
      </MiniChrome>
      {!done && local > 0.3 && local < 0.75 ? <TapDot top={82} left={105} /> : null}
    </View>
  );
}

export function BioVerifyGuideVideo({
  visible,
  onClose,
  link,
  handle,
}: {
  visible: boolean;
  onClose: () => void;
  /** The exact link shown mid-video — same one the copy button copies. */
  link: string;
  handle: string;
}) {
  const t = useTheme();
  const [playT, setPlayT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const lastTick = useRef(0);
  const lastSceneIdx = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The interval below is created once per `visible` toggle, so pausing needs
  // a live-updating ref rather than reading `playing` directly — otherwise a
  // pause wouldn't take effect until the modal closed and reopened.
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    if (!visible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    setPlayT(0);
    setPlaying(true);
    lastTick.current = Date.now();
    lastSceneIdx.current = 0;
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      setPlayT((prev) => {
        if (!playingRef.current) return prev;
        let next = prev + dt;
        if (next >= DUR) next = 0;
        const idx = sceneIndexAt(next);
        if (idx !== lastSceneIdx.current) {
          lastSceneIdx.current = idx;
          void Haptics.selectionAsync();
        }
        return next;
      });
    }, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scene = SCENES[sceneIndexAt(playT)];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#0b0f16' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingTop: 54,
            paddingHorizontal: 16,
            paddingBottom: 10,
          }}
        >
          <Clapperboard size={20} color={t.color.white} />
          <Txt variant="bodyStrong" style={{ flex: 1, color: t.color.white }}>
            How to verify your handle
          </Txt>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={10}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={t.color.white} />
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Stage t={playT} link={link} handle={handle} />
        </View>

        <View style={{ paddingHorizontal: 20, minHeight: 64 }}>
          <Txt
            variant="caption"
            style={{ color: t.color.brand, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', fontSize: 10.5 }}
          >
            {scene.n} of {SCENES.length}
          </Txt>
          <Txt variant="footnote" style={{ color: '#e6e9ef', marginTop: 3, lineHeight: 19 }}>
            {scene.cap}
          </Txt>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {SCENES.map((s, i) => {
              const frac = playT >= s.at + s.len ? 1 : playT <= s.at ? 0 : (playT - s.at) / s.len;
              return (
                <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <View style={{ width: `${frac * 100}%`, height: '100%', backgroundColor: t.color.brand }} />
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setPlaying((p) => !p)}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.13)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              {playing ? <Pause size={16} color={t.color.white} /> : <Play size={16} color={t.color.white} />}
              <Txt variant="bodyStrong" style={{ color: t.color.white, fontSize: 14 }}>
                {playing ? 'Pause' : 'Play'}
              </Txt>
            </Pressable>
            <Pressable
              onPress={() => {
                setPlayT(0);
                setPlaying(true);
                lastSceneIdx.current = 0;
              }}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255,255,255,0.13)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <RotateCcw size={16} color={t.color.white} />
              <Txt variant="bodyStrong" style={{ color: t.color.white, fontSize: 14 }}>
                Restart
              </Txt>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                backgroundColor: t.color.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Txt variant="bodyStrong" style={{ color: t.color.white, fontSize: 14 }}>
                Got it
              </Txt>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Small, quiet trigger button — sits above the copy-link field on the step. */
export function WatchGuideButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        padding: t.spacing.md,
        borderRadius: t.radii.md,
        borderWidth: 1,
        borderColor: t.color.brand,
        backgroundColor: t.color.brandSoft,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 9,
          backgroundColor: t.color.brand,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Play size={16} color={t.color.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="footnote" style={{ color: t.color.brandStrong, fontWeight: '600' }}>
          Watch how it works — 20 seconds
        </Txt>
        <Txt variant="footnote" tone="muted" style={{ fontSize: 12 }}>
          Copy · paste into your bio · verify
        </Txt>
      </View>
    </Pressable>
  );
}
