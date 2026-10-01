/**
 * Build/backend diagnostics for the signed-out screens. Moved out of the old
 * welcome screen intact when it became the intro carousel — see the note
 * below for why it must stay reachable without signing in.
 */
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useTheme } from '@/lib/theme';
import { API_BASE_URL, SUPABASE_URL } from '@/lib/supabase';
import { LAST_COMMIT_TIME } from '@/lib/build-info';
import { Txt } from '@/components/ui';

/**
 * Which bundle is this, and which backend is it talking to?
 *
 * Deliberately on the SIGNED-OUT screen. The same information exists in
 * Settings, but Settings is behind sign-in — so it is unreachable in exactly
 * the situation where you most need it ("I cannot log in, and I do not know
 * whether the fix I was sent is even on this phone").
 *
 * An OTA update downloads in the background and applies on the NEXT launch, so
 * a single reopen after a publish still runs the old code. `Updates.updateId`
 * is the only reliable way to tell which one is actually running.
 *
 * Nothing here is a secret: the API host is in every request the app makes and
 * the Supabase ref is the first half of the publicly-shipped anon key.
 */
export function BuildStrip() {
  const t = useTheme();
  const apiHost = API_BASE_URL.replace(/^https?:\/\//, '');
  const sbRef = (() => {
    try {
      return new URL(SUPABASE_URL).hostname.split('.')[0];
    } catch {
      return 'unknown';
    }
  })();
  const update = Updates.isEmbeddedLaunch
    ? 'embedded (no OTA applied)'
    : (Updates.updateId ?? 'unknown').slice(0, 8);

  // The channel is baked into the binary at build time and never changes for
  // that install — it is what decides which OTA updates this app can ever
  // receive. Worth showing beside the build id: "why did my fix not arrive?"
  // is almost always answered by the channel, not by the update.
  const channel = Updates.channel ?? 'none (local build)';

  /**
   * The bundle identifier of the INSTALLED binary.
   *
   * This is the line that settles "which app is this really?". Before
   * 2026-08-04 the preview profile produced `com.influnet.app` — the same
   * identifier the production profile uses — so a preview APK installed back
   * then is indistinguishable from a production build by name or icon, and
   * follows the preview channel forever. Showing the id next to the channel
   * makes that visible instead of inferable.
   *
   * CAVEAT: this reads `expoConfig`, which an OTA carries its own copy of — so
   * strictly it reports what the running BUNDLE believes the id is, not what
   * the installed binary's id actually is. In practice the two agree, because
   * app.config.js derives the id from EAS_BUILD_PROFILE and an update built
   * from the same profile resolves it identically.
   *
   * The authoritative reading is `Application.applicationId` from
   * expo-application, which asks the OS. That package is not a dependency here
   * and adding a native module to settle a diagnostic is a poor trade — the
   * channel line above already answers the question this one corroborates.
   */
  const bundleId =
    (Constants.expoConfig as { ios?: { bundleIdentifier?: string }; android?: { package?: string } } | null)
      ?.ios?.bundleIdentifier ??
    (Constants.expoConfig as { android?: { package?: string } } | null)?.android?.package ??
    'unknown';

  return (
    <Txt variant="caption" tone="muted" style={{ textAlign: 'center', marginTop: t.spacing.md }}>
      {`build ${LAST_COMMIT_TIME} · update ${update}`}
      {'\n'}
      {`channel ${channel} · ${bundleId}`}
      {'\n'}
      {`api ${apiHost} · db ${sbRef}`}
    </Txt>
  );
}
