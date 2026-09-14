/**
 * `fetch` with a deadline, because a vendor that hangs is worse than a vendor
 * that fails.
 *
 * ── Why this matters more than it sounds ──────────────────────────────────
 * A failed request returns in milliseconds and the code handles it. A HUNG
 * request holds a server request open until the platform's own timeout fires,
 * which on Azure Container Apps is minutes. Under any real traffic that drains
 * the request pool, and then the WHOLE app is slow — the signup page, the
 * dashboard, chat — because one third party stopped answering.
 *
 * That is the failure mode where "one broken module takes everything with it"
 * actually happens in practice. Not a crash: a queue.
 *
 * ── Budgets ───────────────────────────────────────────────────────────────
 * Named rather than passed as magic numbers, so the reasoning survives:
 *
 *   MONEY    5s   Razorpay. Short on purpose — a user is staring at a spinner
 *                 in a checkout, and a slow failure they can retry beats a
 *                 30s wait that probably fails anyway.
 *   CHAT     5s   Stream. Interactive; same reasoning.
 *   EMAIL    8s   Resend. Nobody is watching a notification send.
 *   PUSH     8s   Expo push. Fire-and-forget from the caller's point of view.
 *   INTERNAL 8s   Our own API, called from the browser. Same-origin and so
 *                 low-risk for the SERVER, but an unbounded one leaves a user
 *                 watching "Checking availability…" forever during signup.
 *   SCRAPE  15s   Apify / HikerAPI. Genuinely slow work, and already
 *                 background-ish. Still bounded.
 *   UPLOAD  60s   Cloudinary, from the browser, with a real file attached.
 *                 Generous because the payload can be large — but a
 *                 half-finished upload should still eventually give up rather
 *                 than spin forever.
 *
 * ── Distinguishing a timeout from a failure ───────────────────────────────
 * `AbortSignal.timeout` throws a TimeoutError. Callers that need to tell "they
 * said no" apart from "they never answered" can use `isTimeout(err)` — the
 * retry decision is usually different for the two.
 */

export const TIMEOUT = {
  MONEY: 5_000,
  CHAT: 5_000,
  EMAIL: 8_000,
  PUSH: 8_000,
  INTERNAL: 8_000,
  SCRAPE: 15_000,
  UPLOAD: 60_000,
} as const;

/**
 * `fetch`, but it gives up.
 *
 * Honours a caller-supplied `signal` as well: if the caller already has its own
 * AbortController, both it and the deadline can cancel the request. Without
 * this, passing `signal` would silently replace the timeout and the call would
 * become unbounded again — a footgun worth closing.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = TIMEOUT.SCRAPE, signal: callerSignal, ...rest } = init;

  const deadline = AbortSignal.timeout(timeoutMs);
  const signal =
    callerSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([callerSignal, deadline])
      : (callerSignal ?? deadline);

  return fetch(input, { ...rest, signal });
}

/** True when this error is a deadline being hit rather than a refusal. */
export function isTimeout(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'TimeoutError' || name === 'AbortError';
}
