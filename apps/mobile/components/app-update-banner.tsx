/**
 * The visible half of lib/use-app-update.ts.
 *
 * Three states of interruption, matching how the hook progresses:
 *  - `available`, before the user has touched it: a big card near the top of
 *    the screen — deliberately in the way, so a fix that is ready is not
 *    easy to miss. The only state with a close (X) — dismissing it is what
 *    demotes everything below to the quiet form.
 *  - `available` (skipped) / `downloading` / `ready`: a slim bar attached to
 *    the top edge of the bottom tab bar. Never blocks the content above it,
 *    and deliberately has NO close — once the user has been told once, the
 *    reminder stays until the update is actually applied rather than
 *    disappearing and being forgotten.
 *  - `ready`, left too long: escalates to the existing full-screen restart
 *    prompt (unchanged, already correct).
 */
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, RefreshCw, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useAppUpdate } from '@/lib/use-app-update';
import { Button, Txt } from './ui';

/**
 * React Navigation's default bottom-tab height (excludes the safe-area inset,
 * which is added separately below) — this app does not override it in
 * (tabs)/_layout.tsx. Approximate rather than measured: this banner is
 * rendered at the root, above the tab navigator, so the actual rendered
 * height is not available via context here. On the handful of screens with
 * no tab bar at all there is nothing to attach to anyway, so the same offset
 * just leaves a bit of harmless extra clearance above the bottom edge there.
 */
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;

export function AppUpdateBanner({ enabled }: { enabled: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, forceRestart, download, restart, dismiss } = useAppUpdate(enabled);
  // Component-local, not part of the hook: whether the user has acted on the
  // initial interrupting card at least once (skip or download). Once true,
  // every remaining state renders as the quiet attached bar, permanently —
  // there is no way back to the big card for this update.
  const [interruptDismissed, setInterruptDismissed] = useState(false);

  if (state === 'idle' || state === 'error') return null;

  if (forceRestart) {
    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: t.spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: t.color.surfaceCard,
            borderRadius: t.radii.lg,
            padding: t.spacing.xl,
            gap: t.spacing.md,
            alignItems: 'center',
          }}
        >
          <RefreshCw size={28} color={t.color.brand} />
          <Txt variant="title2" center>
            Update ready
          </Txt>
          <Txt variant="body" tone="soft" center>
            A fix has been downloaded and is waiting to apply. Restart to pick it up — it only
            takes a second.
          </Txt>
          <Button label="Restart now" onPress={restart} style={{ marginTop: t.spacing.sm }} />
        </View>
      </View>
    );
  }

  const showBigCard = state === 'available' && !interruptDismissed;

  if (showBigCard) {
    return (
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          // Dimmed scrim, not a true blur — expo-blur isn't a dependency yet,
          // and adding one now would need a fresh native build before this
          // could reach anyone over OTA (the exact trap the location-autofill
          // feature hit earlier). This reads the same way: background pushed
          // back, the card is the only thing in focus.
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: t.spacing.xl,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: t.color.surfaceCard,
            borderRadius: t.radii.lg,
            padding: t.spacing.lg,
            gap: t.spacing.sm,
            ...t.shadows.pop,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: t.radii.md,
                backgroundColor: t.color.brandSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Download size={20} color={t.color.brand} />
            </View>
            <Pressable
              onPress={() => setInterruptDismissed(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <X size={20} color={t.color.contentSoft} />
            </Pressable>
          </View>

          <Txt variant="title2">Update available</Txt>
          <Txt variant="body" tone="soft">
            A newer version is ready — download it to pick up the latest fixes.
          </Txt>

          <Button
            label="Download now"
            onPress={() => {
              setInterruptDismissed(true);
              void download();
            }}
            style={{ marginTop: t.spacing.sm }}
          />
        </View>
      </View>
    );
  }

  // Quiet, attached form: available-but-skipped / downloading / ready.
  // Flush with the top edge of the tab bar, never overlapping it.
  return (
    <View
      style={{
        position: 'absolute',
        left: t.spacing.md,
        right: t.spacing.md,
        bottom: insets.bottom + TAB_BAR_HEIGHT,
      }}
    >
      <Pressable
        disabled={state !== 'available'}
        onPress={() => void download()}
        style={{
          backgroundColor: t.color.surfaceCard,
          borderTopLeftRadius: t.radii.md,
          borderTopRightRadius: t.radii.md,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: t.color.hairlineStrong,
          padding: t.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
        }}
      >
        {state === 'downloading' ? (
          <ActivityIndicator color={t.color.brand} />
        ) : (
          <RefreshCw size={18} color={t.color.brand} />
        )}

        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">
            {state === 'downloading'
              ? 'Downloading update…'
              : state === 'ready'
                ? 'Update ready'
                : 'Update available'}
          </Txt>
          <Txt variant="footnote" tone="muted">
            {state === 'downloading'
              ? 'Runs in the background — keep using the app.'
              : state === 'ready'
                ? 'Restart to apply it.'
                : 'Tap to download.'}
          </Txt>
        </View>

        {state === 'ready' ? (
          <Button label="Restart" size="md" inline onPress={restart} haptic={false} />
        ) : null}
      </Pressable>
    </View>
  );
}
