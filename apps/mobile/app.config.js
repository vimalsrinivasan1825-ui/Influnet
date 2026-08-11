/**
 * Wraps the static app.json to make one field build-profile aware: the
 * `aps-environment` iOS entitlement the expo-notifications plugin writes.
 *
 * Apple requires this to match how the app was signed —
 *   'development' for Xcode / dev-client builds (a debuggable binary),
 *   'production'  for anything ad-hoc, TestFlight, or App Store.
 * A static app.json can only ever emit one value for every profile. Left
 * unset, the plugin defaults to 'development' for every build including
 * `production`; inspecting the App Store build that actually shipped (build
 * bb884df8) showed the entitlement missing entirely — EAS's credential sync
 * had no Push Notifications capability enabled on the App ID to attach it to,
 * so it was dropped rather than failing the build. That capability still has
 * to be turned on for com.influnet.app (EAS does this itself on the next
 * `eas build` once it has an App Store Connect API key, or it's a manual step
 * at developer.apple.com → Certificates, Identifiers & Profiles).
 *
 * EAS Build sets EAS_BUILD_PROFILE to the profile name being built
 * (development/preview/preview-device/production — see eas.json). Local
 * `expo start` never sets it, but that path never signs a native binary, so
 * the entitlement value there is moot.
 */
const config = require('./app.json');

const profile = process.env.EAS_BUILD_PROFILE;
const isDevClientBuild = profile === 'development';

config.expo.plugins = config.expo.plugins.map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
    return [plugin[0], { ...plugin[1], mode: isDevClientBuild ? 'development' : 'production' }];
  }
  return plugin;
});

/**
 * App identity per build profile, so development/staging/production installs
 * sit side by side on one phone as separate apps instead of each install
 * overwriting the last — iOS/Android tell apps apart by bundle ID alone, so
 * the same ID is "the same app" regardless of which OTA channel it updates
 * from. `production` (and local `expo start`, which never sets
 * EAS_BUILD_PROFILE) fall through to app.json's own identity untouched.
 */
const IDENTITY_BY_PROFILE = {
  development: {
    name: 'Influnet Dev',
    bundleIdentifier: 'com.influnet.app.dev',
    package: 'com.influnet.app.dev',
  },
  // Named "Preview", NOT "Staging". This profile publishes to the `preview`
  // channel and points at the DEV backend and the DEV database (see eas.json) —
  // calling it Staging made the home-screen icon claim the opposite of what the
  // app actually talks to, and cost real time diagnosing a login failure where
  // "the staging app is using the dev database" sounded like the bug rather
  // than the correct behaviour.
  //
  // The bundle IDs deliberately still say `.staging`. iOS and Android identify
  // an app by bundle ID alone, so changing it would install a SECOND app beside
  // the one already on people's phones and strand their session and push token
  // in the old one. The display name is cosmetic and safe to correct; the
  // identifier is not. Rename it only alongside a deliberate reinstall.
  preview: {
    name: 'Influnet Preview',
    bundleIdentifier: 'com.influnet.app.staging',
    package: 'com.influnet.app.staging',
  },
  'preview-device': {
    name: 'Influnet Preview',
    bundleIdentifier: 'com.influnet.app.staging',
    package: 'com.influnet.app.staging',
  },
};

const identity = IDENTITY_BY_PROFILE[profile];
if (identity) {
  config.expo.name = identity.name;
  config.expo.ios.bundleIdentifier = identity.bundleIdentifier;
  config.expo.android.package = identity.package;
}

module.exports = config;
