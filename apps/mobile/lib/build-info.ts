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
export const LAST_COMMIT_TIME = '2026-09-02T16:45:00Z';
