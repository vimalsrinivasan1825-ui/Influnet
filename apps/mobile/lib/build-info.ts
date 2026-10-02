import { requireOptionalNativeModule } from 'expo';

/**
 * Which commit this JS bundle was built from.
 *
 * Updated on every commit that ships — an OTA `eas update` or a store build —
 * otherwise the app reports a build time that predates what the user is running.
 *
 * Lives here rather than inside settings.tsx because it is now read from two
 * places: Settings (signed in) and the welcome screen's build strip (signed
 * out). The signed-out copy is the one that matters when someone cannot log in
 * and needs to tell you which bundle they actually have.
 *
 * The Update ID and OTA date shown beside it come from expo-updates at runtime
 * and need no maintenance.
 */
export const LAST_COMMIT_TIME = '2026-10-02T08:03:14Z';

/**
 * The INSTALLED binary's version and build number, e.g. "1.0.0 (8)", asked of
 * the OS — not of the JS bundle, which an OTA replaces.
 *
 * Every store build shares runtime 1.0.0, so an old binary silently picks up
 * the latest OTA and looks current after one restart. On 2026-10-02 a Play
 * testing link installed an old build (versionCode ≤4, build 8 was still in
 * review), it updated itself, and it read as "build 8 ships stale code". The
 * update id cannot tell those apart; the versionCode can.
 *
 * Read through `requireOptionalNativeModule`, not `expo-application`'s JS: that
 * package is not a declared dependency, and its wrapper throws when the native
 * module is missing. The module is linked into every build so far (pulled in by
 * expo-notifications), but this line ships by OTA to binaries back to July, so
 * it returns null rather than crashing if one ever lacks it.
 */
export function nativeBuildLabel(): string | null {
  const app = requireOptionalNativeModule<{
    nativeApplicationVersion?: string | null;
    nativeBuildVersion?: string | null;
  }>('ExpoApplication');
  if (!app?.nativeBuildVersion) return null;
  return `${app.nativeApplicationVersion ?? '?'} (${app.nativeBuildVersion})`;
}
