/**
 * One internal product document, at /r/<token>/<doc>.
 *
 * Documents are registered in DOCS below. An unknown slug 404s exactly like a
 * wrong token, so the set of documents is not enumerable from outside.
 */
import { checkAccess, baseFor, htmlResponse, notFound } from '../gate';
import { planBody } from '../plan-body';
import { releaseBody } from '../release-body';
import { testRunBody } from '../test-run-body';

// The gate must be evaluated per request, never prerendered at build time.
export const dynamic = 'force-dynamic';

const DOCS: Record<string, (base: string) => string> = {
  'release-1': releaseBody,
  plan: planBody,
  'test-run': testRunBody,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; doc: string }> }
) {
  const { token, doc } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  const render = Object.prototype.hasOwnProperty.call(DOCS, doc) ? DOCS[doc] : null;
  if (!render) return notFound();

  return htmlResponse(render(baseFor(token)));
}
