/**
 * Deep-linking into the Instagram app.
 *
 * The "Open Instagram" buttons used to send `instagram://user?username=self`.
 * There is no `self` alias in Instagram's URL scheme — it takes that literally,
 * looks up an account actually named "self", and dumps the user on a lookup /
 * not-found screen instead of their own profile. Send the creator's real handle
 * instead: that lands on their profile, where "Edit profile" (the bio field we
 * are asking them to paste into) is one tap away.
 */
import { Linking } from 'react-native';

/**
 * Open the creator's own Instagram profile, falling back to the web profile if
 * the app isn't installed, and to Instagram's home if we don't know the handle.
 *
 * Ordered candidates rather than `canOpenURL` — on iOS `canOpenURL` needs the
 * scheme declared in LSApplicationQueriesSchemes and reports false otherwise,
 * so a failed `openURL` is the more reliable signal.
 */
export async function openInstagramProfile(handle?: string | null): Promise<void> {
  const h = (handle ?? '').trim().replace(/^@/, '');
  const candidates = h
    ? [`instagram://user?username=${encodeURIComponent(h)}`, `https://www.instagram.com/${encodeURIComponent(h)}/`]
    : ['instagram://app', 'https://www.instagram.com/'];

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Try the next candidate — app not installed, or scheme unhandled.
    }
  }
}
