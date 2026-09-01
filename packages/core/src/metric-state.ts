/**
 * Which of five things a metric card should say.
 *
 * ── WHY A CARD NEEDS MORE THAN TWO STATES ─────────────────────────────
 *
 * The obvious model is "has data / has no data", and it is wrong in both
 * directions at once.
 *
 * At the empty end it conflates two facts that deserve opposite words. An
 * account that has never had a profile view and an account that had forty last
 * month and none this month are both "zero", and telling the second one to
 * "share your profile link to get seen" ignores the only interesting thing on
 * the screen — that something stopped. A zero with history behind it is a
 * signal; a zero without is an empty slot.
 *
 * At the full end it treats one data point as a trend. Someone on day three
 * with three profile views against one the week before gets "+200%" and a
 * sparkline that is a flat line with a single bump on it. Both are arithmetic
 * and neither is information: a percentage off a base of one is noise wearing
 * the costume of insight, and it is worse than showing nothing because the user
 * cannot tell it apart from a real +200%.
 *
 * So: five states, and the split that matters is not "empty vs full" but
 * "how much do we actually know".
 *
 * ── THE STATES ────────────────────────────────────────────────────────
 *
 *   unavailable  We could not read this metric at all. The card is omitted —
 *                there is nothing to say and no honest way to say it. Distinct
 *                from zero, and the distinction is the whole reason `total` is
 *                nullable rather than defaulted.
 *
 *   dormant      Readable, and nothing has ever happened. Show "--" and the one
 *                action that would change it. Never a bold 0: a 0 is a
 *                measurement, and "we measured nought" is a different claim
 *                from "this has not started".
 *
 *   paused       Zero now, but not always. Show the real 0 — here it IS
 *                informative — plus the shape that fell off. This is the state
 *                the two-state model loses entirely, and it is the one most
 *                worth acting on.
 *
 *   warming      Something is happening, but not enough of it to describe a
 *                direction. Show the number, show the sparse shape, and show NO
 *                delta. The number is real; the trend would not be.
 *
 *   live         Enough history to mean it. Number, shape and delta.
 *
 * Kept in core rather than in either app so the two cannot drift on where the
 * thresholds sit, and so the reasoning above lives with the rule it explains.
 */

export type MetricState = 'unavailable' | 'dormant' | 'paused' | 'warming' | 'live';

export interface MetricInput {
  /**
   * The figure the card leads with. `null` means UNREADABLE — a backend behind
   * on migrations, a table the caller cannot see — and must never be defaulted
   * to 0 upstream, or every such account is told nothing has happened.
   */
  total: number | null | undefined;
  /**
   * Daily counts over the window, oldest first. Undefined or null means this
   * metric has no series (not that its series is empty).
   */
  series?: number[] | null;
  /**
   * Evidence that this metric has been non-zero at some point outside the
   * current window — a prior period's count, or an all-time total. It is the
   * only thing that separates `paused` from `dormant`, so a caller that has it
   * should always pass it.
   */
  lifetime?: number | null;
}

export interface MetricVerdict {
  state: MetricState;
  /** Draw the figure. False only when `unavailable`; `dormant` draws "--". */
  showValue: boolean;
  /** Draw the sparkline. False when there is no shape, or none worth drawing. */
  showSeries: boolean;
  /** Draw the percentage change. False whenever the baseline cannot support it. */
  showDelta: boolean;
  /** Days in the window with any activity. Drives the caption a card picks. */
  activeDays: number;
}

/**
 * Confidence floor for a trend.
 *
 * Two conditions rather than one because they fail independently. Forty views
 * that all landed on a single day is a spike, not a trend, and three days of
 * one view each is not enough of anything to have a direction. A metric has to
 * clear both to earn a percentage.
 *
 * Three days and five events are judgement calls, not derivations. They are set
 * where they are because below them the delta on a real account visibly swings
 * on single events, and above them a genuinely new account would sit at
 * `warming` long enough to feel broken.
 */
const MIN_ACTIVE_DAYS = 3;
const MIN_TOTAL_FOR_TREND = 5;

export function metricState(input: MetricInput): MetricVerdict {
  const { total, series, lifetime } = input;

  // Unreadable. Not zero — see the note on `total`.
  if (total == null) {
    return { state: 'unavailable', showValue: false, showSeries: false, showDelta: false, activeDays: 0 };
  }

  const hasSeries = Array.isArray(series) && series.length > 1;
  const activeDays = hasSeries ? series!.filter((v) => v > 0).length : 0;
  const seriesTotal = hasSeries ? series!.reduce((sum, v) => sum + v, 0) : 0;

  if (total <= 0) {
    // Something happened before, just not now. The fall-off is the point, so
    // the series is still drawn when there is one to draw.
    const hadBefore = (lifetime ?? 0) > 0 || seriesTotal > 0;
    if (hadBefore) {
      return {
        state: 'paused',
        showValue: true,
        showSeries: activeDays > 0,
        // A delta into zero is always -100%, on every paused metric, forever.
        // It is arithmetically true and tells nobody anything.
        showDelta: false,
        activeDays,
      };
    }
    return { state: 'dormant', showValue: false, showSeries: false, showDelta: false, activeDays: 0 };
  }

  // There is a real number. The only remaining question is whether the shape
  // and the direction behind it can be trusted.
  const trustworthy = activeDays >= MIN_ACTIVE_DAYS && total >= MIN_TOTAL_FOR_TREND;

  if (trustworthy) {
    return { state: 'live', showValue: true, showSeries: true, showDelta: true, activeDays };
  }

  return {
    state: 'warming',
    showValue: true,
    // Drawn when there is anything to draw. A sparse shape is honest about
    // being sparse as long as the card renders it as discrete marks rather
    // than as a smooth line through two points — see StatCard, which forces
    // the bar form in this state for exactly that reason.
    showSeries: activeDays > 0,
    showDelta: false,
    activeDays,
  };
}
