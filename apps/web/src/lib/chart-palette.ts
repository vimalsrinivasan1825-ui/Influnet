/**
 * Categorical palette for charts with two or more series. Assigned in this
 * order and never cycled — a series past the eighth folds into "Other".
 *
 * Validated as a set (dataviz validate_palette.js, light, on #ffffff): every
 * adjacent pair clears ΔE 9 under colour-vision deficiency and ΔE 19 for
 * normal vision. Slots 3–5 sit under 3:1 against white, so a chart using
 * them must show a legend or direct labels — every multi-series chart here
 * does. The role accent is deliberately NOT slot 1: it changes per role, so
 * it cannot be validated against the rest; single-series charts use
 * CHART_SINGLE instead, and state (ok / failed) uses the status tokens.
 */
export const CHART_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

/** One series: the role accent. Identity needs no colour when there is one. */
export const CHART_SINGLE = "var(--brand)";
