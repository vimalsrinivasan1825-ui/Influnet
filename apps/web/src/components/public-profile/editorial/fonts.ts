import { Plus_Jakarta_Sans } from 'next/font/google';

/**
 * The public profile's type: Plus Jakarta Sans for every role — the face the
 * influnet wordmark is set in, the web dashboard's font, and the mobile app's.
 *
 * This page used to load the landing site's three faces (Bricolage Grotesque,
 * Instrument Sans, Spline Sans Mono). Inside the app — where a creator's
 * profile is a webview of this page — that made it look like a different
 * product from the screens around it. The three CSS roles are kept so the
 * stylesheet needs no changes; they simply all resolve to one family now.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--pf-display',
  display: 'swap',
});

export const display = jakarta;
export const sans = jakarta;
export const mono = jakarta;

/** One variable; --pf-sans and --pf-mono alias it in editorial.module.css. */
export const fontVars = jakarta.variable;
