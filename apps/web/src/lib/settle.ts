/**
 * `Promise.all`, minus the part where one failure discards every sibling.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * `Promise.all` rejects on the FIRST rejection and throws away every result
 * that already succeeded. On a composite endpoint — Home, the dashboards, a
 * public creator profile — that turns "Instagram is rate-limiting us" into a
 * 500 for the whole screen. The user gets a blank page instead of four working
 * panels and one that says "unavailable".
 *
 * That is precisely backwards. A panel is not a transaction; there is no
 * reason for the reach figure to disappear because the reviews query failed.
 *
 * ── The shape ─────────────────────────────────────────────────────────────
 * `settleAll` keeps the tuple destructuring that makes `Promise.all` pleasant
 * to read, and substitutes `null` for anything that threw:
 *
 *   const [ig, yt, reviews] = await settleAll(
 *     [getInstagramSnapshot(id), getYouTubeSnapshot(id), getPublicReviews(id)],
 *     { route: '/api/home' },
 *   );
 *
 * This is a small change at most call sites here because the helpers it wraps
 * already return `T | null` on their own internal errors — the consumers are
 * therefore already written to handle null. What this adds is that a genuine
 * THROW (a vendor SDK, a network reset, a bug in a helper) now degrades the
 * same way an empty result already did, instead of collapsing the response.
 *
 * ── Why failures are reported, not swallowed ──────────────────────────────
 * Degrading quietly is how a broken panel survives for a month. Every failure
 * goes to Sentry with the route and the slot index, so "reviews have been null
 * since Tuesday" is a thing you find out rather than a thing a user mentions.
 *
 * ── When NOT to use this ──────────────────────────────────────────────────
 * When the results form one logical unit and a partial answer would be WRONG
 * rather than merely incomplete — anything that decides a payment, a
 * permission, or a stage transition. Those should keep `Promise.all` and fail
 * loudly. Degrading is for display.
 */
import { captureException } from './observability';

export interface SettleContext {
  /** The route doing the work, e.g. '/api/home'. Shows up as a Sentry tag. */
  route: string;
  /** Optional names, positionally matched to the promises, for readable tags. */
  labels?: readonly string[];
}

type SettledTuple<T extends readonly unknown[]> = {
  [K in keyof T]: Awaited<T[K]> | null;
};

/**
 * Await every promise. Resolved values come back in place; anything that
 * rejected comes back as `null` and is reported.
 */
export async function settleAll<T extends readonly unknown[]>(
  promises: readonly [...T],
  ctx: SettleContext,
): Promise<SettledTuple<T>> {
  const results = await Promise.allSettled(promises);

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;

    const label = ctx.labels?.[i] ?? `slot_${i}`;
    captureException(r.reason, {
      tags: { route: ctx.route, degraded: label },
      extra: {
        note:
          'A parallel sub-task failed; the endpoint degraded this one slot to null ' +
          'and served the rest. See lib/settle.ts.',
      },
    });
    return null;
  }) as SettledTuple<T>;
}

/**
 * Single-promise variant: resolve, or report and fall back.
 *
 * Use where one optional enrichment sits beside required work — a vendor
 * lookup that improves the response but must never decide whether there IS
 * a response.
 */
export async function settleOne<T, F = null>(
  promise: Promise<T>,
  ctx: SettleContext & { label?: string },
  fallback: F = null as F,
): Promise<T | F> {
  try {
    return await promise;
  } catch (err) {
    captureException(err, {
      tags: { route: ctx.route, degraded: ctx.label ?? 'single' },
    });
    return fallback;
  }
}
