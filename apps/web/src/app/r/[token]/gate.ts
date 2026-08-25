/**
 * The gate and the HTML shell shared by everything under /r/<token>.
 *
 * WHY IT IS GATED ON APP_ENV RATHER THAN KEPT OFF THE STAGING BRANCH
 * `dev` flows into `staging` as a whole branch, by PR — see AGENTS.md. Files
 * that lived on `dev` only would be reverted by the next dev → staging PR, or
 * would show up in it as deletions someone has to keep re-approving. So the
 * code ships everywhere and the ROUTES are what is environment-scoped: the dev
 * container sets APP_ENV=dev (deploy-dev.yml), staging sets APP_ENV=staging
 * (deploy-staging.yml), and anything that is not dev 404s.
 *
 * `appEnv` reads the real process environment, not a NEXT_PUBLIC_ constant
 * inlined at build time, so the gate is decided per request in the container
 * that is actually serving it.
 *
 * WHY THE TOKEN
 * Nothing links here and nothing routes here. The path segment is a random
 * 128-bit token, compared in full before anything is served, so the URL is not
 * discoverable by guessing or by crawling the app. This is obscurity, not
 * authentication — it keeps a draft out of sight, and it is not a control to
 * put real secrets behind. In particular the remarks endpoint behind it is
 * unauthenticated, so nothing written there should be treated as private.
 */
import { appEnv } from '@/lib/env';

const TOKEN = '3eca3f69e576ad2b8232171fd0030169';

/**
 * Length-independent comparison. The token is not a credential, but a plain
 * `===` on a secret-shaped string is the kind of thing that gets copied into
 * somewhere it does matter.
 */
function tokenMatches(candidate: string): boolean {
  if (candidate.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Deliberately indistinguishable from any other unmatched path: a wrong token
 * and a wrong environment give the same answer, so neither confirms that
 * anything exists here.
 */
export function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** `null` when the caller may proceed, otherwise the 404 to return as-is. */
export function checkAccess(token: string): Response | null {
  if (appEnv !== 'dev' || !tokenMatches(token)) return notFound();
  return null;
}

/** The tokenised root every in-document link is built from. */
export function baseFor(token: string): string {
  return `/r/${token}`;
}

/**
 * Wraps a document body in the page shell and the caching/indexing headers.
 * The pre-paint script runs before the stylesheet so a saved Light/Dark choice
 * does not flash the other theme on load; the toggle itself is in the body.
 */
export function htmlResponse(body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<script>
  try {
    var m = localStorage.getItem('influnet-report-theme');
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) {}
</script>
</head>
<body>
${body}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Belt and braces alongside the meta tag — a crawler that ignores one
      // generally honours the other.
      'x-robots-tag': 'noindex, nofollow, noarchive',
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}
