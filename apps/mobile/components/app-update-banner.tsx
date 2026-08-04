/**
 * The visible half of lib/use-app-update.ts.
 *
 * Two states of interruption, matching how the hook escalates:
 *  - available/downloading/ready: a small card floating above the bottom
 *    safe area, on top of whatever screen is showing. Never blocks input.
 *  - forceRestart: a full-screen overlay once a downloaded update has sat
 *    unapplied past the grace period. No skip — the point of escalating is
 *    that skipping is what got here.
 */
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Download, RefreshCw, X } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useAppUpdate } from '@/lib/use-app-update';
import { Button, Txt } from './ui';

export function AppUpdateBanner({ enabled }: { enabled: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { state, forceRestart, download, restart, dismiss } = useAppUpdate(enabled);

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

  return (
    <View
      style={{
        position: 'absolute',
        left: t.spacing.md,
        right: t.spacing.md,
        bottom: insets.bottom + t.spacing.md,
      }}
    >
      <View
        style={{
          backgroundColor: t.color.surfaceCard,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.color.hairlineStrong,
          padding: t.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          ...t.shadows.card,
        }}
      >
        {state === 'downloading' ? (
          <ActivityIndicator color={t.color.brand} />
        ) : state === 'ready' ? (
          <RefreshCw size={20} color={t.color.brand} />
        ) : (
          <Download size={20} color={t.color.brand} />
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
              ? 'Keep using the app — this runs in the background.'
              : state === 'ready'
                ? 'Restart to apply it.'
                : 'A newer version is ready to download.'}
          </Txt>
        </View>

        {state === 'available' ? (
          <>
            <Button
              label="Update"
              size="md"
              inline
              onPress={() => void download()}
              haptic={false}
            />
            <Button
              label=""
              variant="ghost"
              size="md"
              inline
              icon={<X size={18} color={t.color.contentSoft} />}
              onPress={dismiss}
              haptic={false}
              accessibilityLabel="Not now"
              style={{ paddingHorizontal: t.spacing.sm }}
            />
          </>
        ) : null}

        {state === 'ready' ? (
          <Button label="Restart" size="md" inline onPress={restart} haptic={false} />
        ) : null}
      </View>
    </View>
  );
}
