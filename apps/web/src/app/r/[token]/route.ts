/**
 * Internal product-plan report, served at an unguessable path.
 *
 * WHY A ROUTE HANDLER AND NOT A PAGE
 * The document is a self-contained HTML file with its own stylesheet. A page
 * component would inherit the root layout's fonts and chrome, which is exactly
 * what this document must not have. A route handler returns the bytes as-is.
 *
 * WHY IT IS GATED ON APP_ENV RATHER THAN KEPT OFF THE STAGING BRANCH
 * `dev` flows into `staging` as a whole branch, by PR — see AGENTS.md. A file
 * that lives on `dev` only would be reverted by the next dev → staging PR, or
 * would show up in it as a deletion someone has to keep re-approving. So the
 * code ships everywhere and the ROUTE is what is environment-scoped: the dev
 * container sets APP_ENV=dev (deploy-dev.yml), staging sets APP_ENV=staging
 * (deploy-staging.yml), and anything that is not dev 404s here.
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
 * put real secrets behind.
 */
import { appEnv } from '@/lib/env';
import { REPORT_BODY } from './report-body';

// The gate must be evaluated per request, never prerendered at build time.
export const dynamic = 'force-dynamic';

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (appEnv !== 'dev' || !tokenMatches(token)) {
    // Deliberately indistinguishable from any other unmatched path: a wrong
    // token and a wrong environment give the same answer, so neither confirms
    // that anything exists here.
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<script>
  // Applied before first paint so a saved Light/Dark choice does not flash the
  // other theme on load. The toggle itself lives at the end of the body.
  try {
    var m = localStorage.getItem('influnet-report-theme');
    if (m === 'light' || m === 'dark') document.documentElement.setAttribute('data-theme', m);
  } catch (e) {}
</script>
</head>
<body>
${REPORT_BODY}
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
