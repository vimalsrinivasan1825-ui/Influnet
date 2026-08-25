/**
 * The index of internal product documents, at /r/<token>.
 *
 * This path served the product plan itself until the second document arrived.
 * It is now a card index, so the link that was already shared keeps working and
 * opens the list rather than one particular document. Access rules and the
 * reasoning behind them live in ./gate.ts.
 */
import { checkAccess, baseFor, htmlResponse } from './gate';
import { indexBody } from './index-body';

// The gate must be evaluated per request, never prerendered at build time.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const denied = checkAccess(token);
  if (denied) return denied;

  return htmlResponse(indexBody(baseFor(token)));
}
