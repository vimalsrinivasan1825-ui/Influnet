/**
 * The card index served at /r/<token>.
 *
 * This path used to render the product plan directly. It became an index when
 * the second document arrived, so the shared link keeps working and now opens
 * a list rather than one long page.
 */
import { REPORT_HEAD, REPORT_THEMER } from './report-chrome';

export function indexBody(base: string): string {
  return `
<title>Influnet Product Documents</title>
${REPORT_HEAD}
<div class="wrap">

<header class="mast">
  <p class="eyebrow">Influnet · Internal · August 2026 · IST</p>
  <h1>Product<br><em>Documents</em></h1>
  <p class="standfirst">Two working documents: the release plan behind the nine proposed features, and the agreed scope of Release 1 as it stands after the 24 August discussion.</p>
</header>

<div class="docgrid">

  <a class="doccard primary" href="${base}/release-1">
    <p class="kicker"><span class="date">24 August 2026</span> <span class="tag t-r1">Release 1</span> <span class="tag t-new">Current</span></p>
    <h3>Release 1 — Final Scope</h3>
    <p>The document to build from. Every feature in the product classified as built, partly built or still to be written, followed by exactly what Release 1 adds and what is explicitly deferred.</p>
    <ul>
      <li>Short-term projects, alongside the full twelve-stage flow</li>
      <li>Invoice and receipt generation</li>
      <li>Open campaigns brands post and creators apply to</li>
      <li>The five profile and reputation features carried over</li>
    </ul>
    <span class="go">Open the scope →</span>
  </a>

  <a class="doccard" href="${base}/plan">
    <p class="kicker"><span class="date">19 August 2026</span> <span class="tag t-r3">Background</span></p>
    <h3>Nine Features, Three Releases</h3>
    <p>The earlier analysis this scope came out of: the nine proposed ideas checked against what was already built, ordered into three releases, and set against thirty competing platforms.</p>
    <ul>
      <li>Build order and complexity for all nine ideas</li>
      <li>What was already built versus what was missing</li>
      <li>Thirty competitors in six groups, and the one thing worth taking from each</li>
    </ul>
    <span class="go">Open the review →</span>
  </a>

  <a class="doccard primary" href="${base}/test-run">
    <p class="kicker"><span class="date">QA runbook</span> <span class="tag t-new">Live checklist</span></p>
    <h3>Two-Phone Test Run</h3>
    <p>A brand on one phone, a creator on the other — 206 steps from signup through every stage of the pipeline to a signed-off, rated project. Mark pass, issue or blocked as you go.</p>
    <ul>
      <li>Every stage of the twelve-stage pipeline, including both payment gates</li>
      <li>Your run is private to your device — nobody else can see or edit it</li>
      <li>Copy your issues out as a ready-to-paste bug list when you're done</li>
    </ul>
    <span class="go">Start testing →</span>
  </a>

</div>

<div class="call" style="margin-top:34px">
  <span class="lbl">How the two relate</span>
  <p>The 19 August review proposed a build order. The 24 August document is what was actually decided, and it overrides the earlier one wherever they disagree — most notably on invoices, which moved from Release 2 into Release 1, and on short-term projects, which the earlier review did not cover at all. Read the scope first; the review is there for the reasoning and the competitor evidence.</p>
</div>

<footer>
  <p>Internal drafts on an unlisted link. Not indexed and not linked from the product, but not access-controlled either — treat the link itself as the only thing keeping these private, and do not put anything confidential in the remarks.</p>
</footer>

${REPORT_THEMER}
</div>
`;
}
