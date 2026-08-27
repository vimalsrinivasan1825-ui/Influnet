/**
 * Release 1 — Final Scope, served at <base>/release-1.
 *
 * The document of record for what R1 contains, written after the 24 August
 * discussion. Where it disagrees with the 19 August plan (./plan-body.ts) this
 * one wins — invoices moved into R1, and short-term projects were not in the
 * earlier review at all.
 *
 * The "already built" classification in §2 was taken from a direct read of the
 * codebase and migrations, not from the older documents, which had gone stale
 * in a few places.
 */
import { REPORT_HEAD, REPORT_THEMER, remarksSection } from './report-chrome';

export function releaseBody(base: string): string {
  return `
<title>Release 1 — Final Scope</title>
${REPORT_HEAD}
<div class="wrap">

<nav class="docnav"><a href="${base}">← All documents</a></nav>

<header class="mast">
  <p class="eyebrow">Influnet · Release 1 · 24 August 2026 · IST</p>
  <h1>Release 1<br><em>Final Scope</em></h1>
  <p class="standfirst">What is already built, what Release 1 adds, and what is deliberately left out. Written after the 24 August discussion; this supersedes the 19 August plan wherever the two disagree.</p>
</header>

<!-- 01 -->
<section id="summary">
  <span class="sec-num">01 — At a glance</span>
  <h2>What Release 1 contains</h2>
  <p class="dek">Three new capabilities and five smaller features that mostly surface data the platform already holds. The three new ones are the release; the five are what make the profiles and the home screen feel finished.</p>

  <div class="tscroll">
  <table>
    <thead><tr><th></th><th>Item</th><th>Status today</th><th>Size</th><th>Why it is in R1</th></tr></thead>
    <tbody>
      <tr><td class="n">A</td><td class="nm">Short-term projects</td><td class="st"><span class="tag t-new">New</span></td><td><span class="tag t-med">Medium</span></td><td>Every accepted deal currently becomes a twelve-stage project. Most real deals are one post and one payment.</td></tr>
      <tr><td class="n">B</td><td class="nm">Invoices &amp; receipts</td><td class="st"><span class="tag t-new">New</span></td><td><span class="tag t-med">Medium</span></td><td>Payments are recorded but produce no document. Moved up from R2 because short-term projects need one to be useful.</td></tr>
      <tr><td class="n">C</td><td class="nm">Open campaigns</td><td class="st"><span class="tag t-new">New</span></td><td><span class="tag t-med">Medium</span></td><td>A creator with no active project has no way to find work. This is the one structural gap.</td></tr>
      <tr><td class="n">D</td><td class="nm">Creator level &amp; progress</td><td class="st"><span class="tag t-partial">Data exists</span></td><td><span class="tag t-low">Low</span></td><td>Follower counts are already collected and refreshed. Presentation only.</td></tr>
      <tr><td class="n">E</td><td class="nm">Creating since (year)</td><td class="st"><span class="tag t-new">New</span></td><td><span class="tag t-low">Low</span></td><td>One signup question, one profile line, one column.</td></tr>
      <tr><td class="n">F</td><td class="nm">Favourites / saved</td><td class="st"><span class="tag t-new">New</span></td><td><span class="tag t-low">Low</span></td><td>Genuinely new, but the simplest kind of feature there is.</td></tr>
      <tr><td class="n">G</td><td class="nm">Networking funnel</td><td class="st"><span class="tag t-partial">Counted, not shown</span></td><td><span class="tag t-low">Low</span></td><td>The stats function already returns most of these numbers. Nothing displays them.</td></tr>
      <tr><td class="n">H</td><td class="nm">Reviews &amp; reputation</td><td class="st"><span class="tag t-partial">Partly built</span></td><td><span class="tag t-med">Medium</span></td><td>Reviews work end to end. Missing: the prompt to leave one, and ratings for brands.</td></tr>
    </tbody>
  </table>
  </div>

  <div class="call">
    <span class="lbl">The shape of the release</span>
    <p><strong>A, B and C are one connected story, not three features.</strong> A brand posts an open campaign; a creator applies; the two agree terms in chat; they choose a short-term project rather than the full twelve stages; the payment produces an invoice. That path does not exist today at any point along it. D through H run alongside as an independent workstream with no dependencies on the three.</p>
  </div>
</section>

<!-- 02 -->
<section id="inventory">
  <span class="sec-num">02 — The product today</span>
  <h2>Everything already built, classified</h2>
  <p class="dek">Taken from a direct read of the codebase and the applied migrations on 24 August 2026, area by area. <span class="tag t-built">Built</span> means working in production on web. <span class="tag t-partial">Partial</span> means the mechanism exists but a visible piece is missing. <span class="tag t-later">Off</span> means built and deliberately disabled.</p>

  <h3>Accounts &amp; onboarding</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Signup as creator or business</td><td class="st"><span class="tag t-built">Built</span></td><td>Role chosen at signup and enforced everywhere downstream; rate limited per IP.</td></tr>
      <tr><td class="nm">Live username availability</td><td class="st"><span class="tag t-built">Built</span></td><td>Checked as you type, with suggestions when taken.</td></tr>
      <tr><td class="nm">Social accounts at signup</td><td class="st"><span class="tag t-built">Built</span></td><td>Instagram, YouTube and the other supported platforms, connected on tap and checked for existence and public visibility.</td></tr>
      <tr><td class="nm">Business approval gate</td><td class="st"><span class="tag t-built">Built</span></td><td>A business cannot send a collaboration request until an admin approves the account.</td></tr>
      <tr><td class="nm">Phone OTP at signup</td><td class="st"><span class="tag t-later">Off</span></td><td>Complete on web and mobile, behind a runtime flag. Provider covers India only.</td></tr>
      <tr><td class="nm">Email address confirmation</td><td class="st"><span class="tag t-later">Off</span></td><td><strong>Signup never verifies the address.</strong> This is a settings toggle, not a build — and it is a pre-launch blocker regardless of R1.</td></tr>
    </tbody>
  </table>
  </div>

  <h3>Profiles, portfolio &amp; verification</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Public creator profile</td><td class="st"><span class="tag t-built">Built</span></td><td>Shareable page with real audience figures, refreshed from the connected platforms.</td></tr>
      <tr><td class="nm">Business profile</td><td class="st"><span class="tag t-built">Built</span></td><td>Private to signed-in users by design.</td></tr>
      <tr><td class="nm">Portfolio with proof</td><td class="st"><span class="tag t-built">Built</span></td><td>Past work with thumbnails served from our own snapshot cache.</td></tr>
      <tr><td class="nm">Ownership verification</td><td class="st"><span class="tag t-built">Built</span></td><td>One-time code placed in the account bio, checked live. The only route to the verified badge.</td></tr>
      <tr><td class="nm">Verified badge integrity</td><td class="st"><span class="tag t-built">Built</span></td><td>The badge can no longer be written by the account that owns it; it is derived from the verification pipeline.</td></tr>
      <tr><td class="nm">Profile link-click tracking</td><td class="st"><span class="tag t-built">Built</span></td><td>Counted with de-duplication, so the number a creator shows a brand means something.</td></tr>
      <tr><td class="nm">Creator level / tier</td><td class="st"><span class="tag t-new">Not built</span></td><td>The underlying follower data is collected. Nothing displays a tier. <strong>R1 item D.</strong></td></tr>
      <tr><td class="nm">Creating since (year)</td><td class="st"><span class="tag t-new">Not built</span></td><td><strong>R1 item E.</strong></td></tr>
    </tbody>
  </table>
  </div>

  <h3>Discovery &amp; getting to a deal</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Creator search &amp; filters</td><td class="st"><span class="tag t-built">Built</span></td><td>Brands search creators by platform, audience and category.</td></tr>
      <tr><td class="nm">Command palette</td><td class="st"><span class="tag t-built">Built</span></td><td>Header search jumps to people, projects and conversations.</td></tr>
      <tr><td class="nm">Collaboration requests</td><td class="st"><span class="tag t-built">Built</span></td><td>A brand approaches one creator with a message and a budget; the creator accepts or declines.</td></tr>
      <tr><td class="nm">Chat</td><td class="st"><span class="tag t-built">Built</span></td><td>Real-time 1:1 messaging with push and email notification.</td></tr>
      <tr><td class="nm">Terms proposal in chat</td><td class="st"><span class="tag t-built">Built</span></td><td>Title, description, budget, advance and due date, proposed by either side and accepted by the other. Accepting is what creates the project.</td></tr>
      <tr><td class="nm">Creators finding work</td><td class="st"><span class="tag t-new">Not built</span></td><td><strong>Nothing exists.</strong> Discovery runs one way only: brands find creators. <strong>R1 item C.</strong></td></tr>
      <tr><td class="nm">Favourites / saved creators</td><td class="st"><span class="tag t-new">Not built</span></td><td><strong>R1 item F.</strong></td></tr>
    </tbody>
  </table>
  </div>

  <h3>Running the work</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Twelve-stage project flow</td><td class="st"><span class="tag t-built">Built</span></td><td>From kick-off to completion, with a checklist per stage and posted updates.</td></tr>
      <tr><td class="nm">Mutual sign-off</td><td class="st"><span class="tag t-built">Built</span></td><td>Eight of the twelve stages move only when both sides confirm, written atomically so simultaneous clicks cannot clobber each other.</td></tr>
      <tr><td class="nm">Skipping a stage</td><td class="st"><span class="tag t-built">Built</span></td><td>Non-essential stages can be skipped by mutual agreement. Payment stages, final approval and the review fork can never be skipped.</td></tr>
      <tr><td class="nm">Revision loop</td><td class="st"><span class="tag t-built">Built</span></td><td>A brand sends work back; the creator resubmits into re-review rather than straight to approval.</td></tr>
      <tr><td class="nm">Change requests</td><td class="st"><span class="tag t-built">Built</span></td><td>Either side can propose changed terms mid-project; the other accepts.</td></tr>
      <tr><td class="nm">Cancellation &amp; reopening</td><td class="st"><span class="tag t-built">Built</span></td><td>Cancelled projects are retained rather than deleted, and can be reopened by request.</td></tr>
      <tr><td class="nm">Project activity timeline</td><td class="st"><span class="tag t-built">Built</span></td><td>Derived from real records, not a separate event log.</td></tr>
      <tr><td class="nm">Short-term / quick projects</td><td class="st"><span class="tag t-new">Not built</span></td><td><strong>Every accepted deal becomes the full twelve stages.</strong> <strong>R1 item A.</strong></td></tr>
    </tbody>
  </table>
  </div>

  <h3>Money</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Real payments</td><td class="st"><span class="tag t-built">Built</span></td><td>Live payment gateway, proven end to end with real test-mode transactions.</td></tr>
      <tr><td class="nm">Payment gates</td><td class="st"><span class="tag t-built">Built</span></td><td>The advance and final payment stages open only when a signed webhook confirms a captured payment. Amounts are derived server-side from the agreed terms, never sent by the browser.</td></tr>
      <tr><td class="nm">Payment ledger</td><td class="st"><span class="tag t-built">Built</span></td><td>Every payment recorded with amount, stage, reference and a paid status only a verified confirmation can set.</td></tr>
      <tr><td class="nm">Earnings on the home screen</td><td class="st"><span class="tag t-built">Built</span></td><td>Money in, money pending and pipeline value, from real rows.</td></tr>
      <tr><td class="nm">Invoice or receipt document</td><td class="st"><span class="tag t-new">Not built</span></td><td>Payments exist as rows; neither side can download anything. <strong>R1 item B.</strong></td></tr>
      <tr><td class="nm">Subscriptions / Pro plan</td><td class="st"><span class="tag t-later">Off</span></td><td>Plan limits, entitlements and checkout are built and shipped disabled. Limits live in settings, not in code.</td></tr>
      <tr><td class="nm">Free-tier conversion cap</td><td class="st"><span class="tag t-built">Built</span></td><td>Requests are unlimited; converting a deal into a project is capped at five for the lifetime of a free account.</td></tr>
    </tbody>
  </table>
  </div>

  <h3>Trust, reputation &amp; safety</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Reviews after completion</td><td class="st"><span class="tag t-partial">Partial</span></td><td>Star ratings and written reviews, restricted to the two people who actually completed a project together, with the average on the profile. Missing: the prompt at the right moment, criteria-level scoring, and ratings for brands. <strong>R1 item H.</strong></td></tr>
      <tr><td class="nm">Blocking</td><td class="st"><span class="tag t-built">Built</span></td><td>Enforced server-side, not just hidden in the UI.</td></tr>
      <tr><td class="nm">Reporting a person</td><td class="st"><span class="tag t-built">Built</span></td><td>Separate from product feedback, with an admin moderation queue.</td></tr>
      <tr><td class="nm">Rate limiting</td><td class="st"><span class="tag t-built">Built</span></td><td>Across signup, messaging, requests and every write-heavy route.</td></tr>
      <tr><td class="nm">Collaboration stats</td><td class="st"><span class="tag t-partial">Partial</span></td><td>Partners worked with, projects active, completed and cancelled, and accepted requests are all counted from real records. No screen shows them as a funnel. <strong>R1 item G.</strong></td></tr>
    </tbody>
  </table>
  </div>

  <h3>Platform &amp; operations</h3>
  <div class="tscroll">
  <table>
    <thead><tr><th>Capability</th><th>State</th><th>Detail</th></tr></thead>
    <tbody>
      <tr><td class="nm">Mobile app</td><td class="st"><span class="tag t-built">Built</span></td><td>Native iOS and Android app covering the core loop, including the stage flow, payments and push.</td></tr>
      <tr><td class="nm">Notifications</td><td class="st"><span class="tag t-built">Built</span></td><td>In-app, push and email, with per-template kill switches and unsubscribe.</td></tr>
      <tr><td class="nm">Admin console</td><td class="st"><span class="tag t-built">Built</span></td><td>Users, businesses, projects, verifications, support tickets, feedback, analytics, health and an audit log of admin actions.</td></tr>
      <tr><td class="nm">Support tickets</td><td class="st"><span class="tag t-built">Built</span></td><td>A user can reach a human in-product and get a reply.</td></tr>
      <tr><td class="nm">Error &amp; uptime monitoring</td><td class="st"><span class="tag t-built">Built</span></td><td>Error reporting and application monitoring wired on all tiers.</td></tr>
      <tr><td class="nm">Production tier</td><td class="st"><span class="tag t-new">Not built</span></td><td><strong>There is no production environment.</strong> What is named "production" in the configuration points at the staging database. Outside R1, but it blocks any public launch of it.</td></tr>
    </tbody>
  </table>
  </div>
</section>

<!-- 03 -->
<section id="shortterm">
  <span class="sec-num">03 — Item A</span>
  <h2>Short-term projects</h2>
  <p class="dek">The largest behavioural change in the release, and the one most likely to be felt immediately.</p>

  <div class="call w">
    <span class="lbl">The problem</span>
    <p>Today there is exactly one way for work to exist on Influnet. Two people agree terms in chat, one accepts, and a <strong>twelve-stage project</strong> is created — kick-off, discussion, advance payment, content planning, content confirmation, shooting, editing, review, revisions, final approval, final payment, completion. That is the right structure for a month-long campaign with a shoot and a revision cycle.</p>
    <p>It is the wrong structure for the majority of real deals, which are one story, one reel, or one post, agreed on Tuesday and delivered on Thursday. Forcing those through twelve stages means both sides tick through stages that describe nothing, and the flow reads as bureaucracy rather than structure. The realistic outcome is that people finish the work in chat and abandon the project.</p>
  </div>

  <h3>The change</h3>
  <p>At the moment terms are accepted in chat, the person creating the project chooses <strong>which kind of project this is</strong>. The choice is made once, at creation, and is not a setting to be changed later.</p>

  <div class="vs">
    <div>
      <h4>Full project</h4>
      <p class="meta">Long-term · unchanged</p>
      <ul>
        <li>The existing twelve stages, exactly as they work today</li>
        <li>Advance payment and final payment as separate gates</li>
        <li>Content planning, confirmation, shoot, edit, review, revisions</li>
        <li>Mutual sign-off at each stage; skippable stages stay skippable</li>
        <li>For campaigns, multi-deliverable work, anything with a shoot</li>
      </ul>
    </div>
    <div class="pick">
      <h4>Short-term project</h4>
      <p class="meta">New · one or two steps</p>
      <ul>
        <li>Agree → deliver → paid. Two steps, both with mutual sign-off</li>
        <li>A single payment rather than an advance and a balance</li>
        <li>Scope, dates, description and amount captured once, up front</li>
        <li>An invoice generated from that same information</li>
        <li>For one post, one reel, one story, a barter deal, a quick shout-out</li>
      </ul>
    </div>
  </div>

  <h3>What the creator fills in</h3>
  <p>The short-term form is the whole project — there are no later stages to collect anything, so it has to be right at the point of creation. Everything on it is already understood by the terms proposal that exists today; this gathers it in one place instead of across twelve stages.</p>

  <ol class="steps">
    <li><strong>What the work is</strong><span>The main context of the deal in one line — "one Instagram reel, 30 seconds, product in frame". This is the project title and it is what appears on the invoice.</span></li>
    <li><strong>Description &amp; deliverables</strong><span>The detail: what is being made, how many pieces, where it will be posted, and anything the brand must supply. Written once and agreed by both sides rather than negotiated stage by stage.</span></li>
    <li><strong>Dates</strong><span>Start and delivery date. A short-term project with no delivery date is a full project wearing the wrong label, so the date is required.</span></li>
    <li><strong>Payment</strong><span>One amount and when it is due — before delivery or after. Barter deals record what is being exchanged instead of a figure, and generate a zero-value record rather than being blocked.</span></li>
    <li><strong>Confirm, both sides</strong><span>The other party sees the whole thing on one card and accepts or asks for a change, using the proposal mechanism that already exists. The project starts only on acceptance.</span></li>
    <li><strong>Deliver and close</strong><span>The creator marks the work delivered with a link or an upload; the brand confirms; payment is confirmed by the same signed webhook that guards the full flow; an invoice is generated.</span></li>
  </ol>

  <div class="call">
    <span class="lbl">What must not change</span>
    <p>A short-term project is a shorter path, <strong>not a weaker one</strong>. Both confirmations are still mutual and still recorded, the payment gate still opens only on a verified payment, cancellation and reporting still work the same way, and the project still counts towards the free-tier conversion limit. Nothing here creates a route that lets one party close a project or mark money received on their own — that class of bug has been closed twice in this codebase already and must not be reintroduced through a side door.</p>
  </div>
</section>

<!-- 04 -->
<section id="invoices">
  <span class="sec-num">04 — Item B</span>
  <h2>Invoices &amp; receipts</h2>
  <p class="dek">Moved up from Release 2. Short-term projects are the reason: a quick deal with no paperwork at the end is not obviously better than doing it over WhatsApp.</p>

  <p>Every payment on the platform is already recorded with its amount, its stage, its gateway reference and a paid status that only a verified confirmation can set. The data for a document is complete. What does not exist is the document.</p>

  <div class="call w">
    <span class="lbl">One decision has to be made first</span>
    <p>A <strong>tax invoice</strong> is a legal instrument. It needs a gapless numbering series, GST registration details, and a clear answer to who is supplying whom — is Influnet selling a service to the brand, or is the creator selling to the brand with Influnet as the venue? That is a question for whoever handles the accounts. It is not a development question and the build should not wait on it.</p>
    <p><strong>The recommendation is to ship both layers, in this order.</strong> The document generator is the same either way; only the header, the numbering and the tax lines differ.</p>
  </div>

  <div class="vs">
    <div class="pick">
      <h4>Payment receipt / statement</h4>
      <p class="meta">Ships in R1 · no external dependency</p>
      <ul>
        <li>A branded record of what was agreed and what was paid</li>
        <li>Generated from payment rows that are already verified</li>
        <li>Downloadable as PDF by both sides, from the project</li>
        <li>Carries no tax claim, so it creates no tax exposure</li>
        <li>Solves the real need: proof of the deal and its payments</li>
      </ul>
    </div>
    <div>
      <h4>Tax invoice</h4>
      <p class="meta">R1 if the accounts answer arrives, otherwise R2</p>
      <ul>
        <li>Same generator, plus a numbering series that cannot have gaps</li>
        <li>Supplier and recipient GST details, place of supply, tax breakdown</li>
        <li>Needs the supplier question answered before a line is written</li>
        <li>Once issued, an invoice can be cancelled but never edited</li>
      </ul>
    </div>
  </div>

  <h3>What the generator does</h3>
  <ol class="steps">
    <li><strong>Pulls, never asks</strong><span>Parties, project title, deliverables, dates, agreed amount and payments already made come from the project and the payment ledger. Nothing on the document is typed in by the person generating it, so a document cannot disagree with the record it claims to describe.</span></li>
    <li><strong>Generates on demand from either side</strong><span>Both the creator and the brand can produce and download the same document for a project. For a short-term project this is offered automatically at completion.</span></li>
    <li><strong>Numbers immutably</strong><span>Each issued document gets a stored number and a stored snapshot. Regenerating gives back the same document; it is not re-rendered from data that may have moved on.</span></li>
    <li><strong>Reflects reality</strong><span>An unpaid project produces a proforma clearly marked as not a receipt. Only a payment the gateway confirmed can appear as received.</span></li>
  </ol>
</section>

<!-- 05 -->
<section id="campaigns">
  <span class="sec-num">05 — Item C</span>
  <h2>Open campaigns</h2>
  <p class="dek">The one structural gap in the product. Every competitor reviewed on 19 August has some version of this.</p>

  <p>Discovery on Influnet currently runs in one direction. A brand searches creators and approaches one at a time; a creator waits. A creator with no active project has nothing to do in the app, which is the single clearest reason a creator would stop opening it.</p>

  <h3>The change</h3>
  <p>A business can publish a <strong>campaign</strong> that any creator can see and apply to. The existing one-to-one request flow stays exactly as it is — this is an addition, not a replacement, and a brand that prefers to approach people directly keeps doing that.</p>

  <div class="vs">
    <div>
      <h4>Direct request</h4>
      <p class="meta">Exists today · unchanged</p>
      <ul>
        <li>Brand finds a specific creator and approaches them</li>
        <li>One conversation, one creator</li>
        <li>Creator accepts or declines</li>
      </ul>
    </div>
    <div class="pick">
      <h4>Open campaign</h4>
      <p class="meta">New in R1</p>
      <ul>
        <li>Brand publishes a brief: what, when, budget, who it suits</li>
        <li>Every eligible creator can find it on a campaigns board</li>
        <li>Creators apply with a short pitch; the brand shortlists</li>
        <li>Accepting an application opens the normal conversation, and from there the normal terms proposal and project</li>
      </ul>
    </div>
  </div>

  <ol class="steps">
    <li><strong>Brand writes the brief</strong><span>Title, description, deliverables, platform, timeline, budget or budget range, and who it is for — follower range, categories, location. Only approved businesses can publish, using the approval gate that already exists.</span></li>
    <li><strong>Creators discover it</strong><span>A campaigns board with the same filters discovery already supports, plus a personalised view of campaigns matching a creator's own platforms and audience size.</span></li>
    <li><strong>Creators apply</strong><span>A short pitch and optionally a proposed rate. Applying is not accepting: it starts nothing and commits nobody.</span></li>
    <li><strong>Brand reviews applicants</strong><span>The brand sees applicants side by side with the profile data already on the platform — audience, verification, past collaborations, rating — and shortlists.</span></li>
    <li><strong>Accepting rejoins the existing flow</strong><span>An accepted application opens a conversation. Everything downstream — terms, project, payments, invoice — is the flow that already works. The campaign feature ends where the deal begins.</span></li>
  </ol>

  <div class="call w">
    <span class="lbl">Spam controls are part of the feature, not a follow-up</span>
    <p>Today a brand can only approach one creator at a time, and that limit is the only thing keeping the platform quiet. An open board removes it by design. Before launch, not after: a cap on live campaigns per brand, a minimum standard for a brief, a way for a creator to report a campaign, an expiry so dead campaigns fall off the board, and admin visibility over all of it. The realistic risk is approved brands being careless, not bad actors getting in.</p>
  </div>

  <div class="call">
    <span class="lbl">How this interacts with plan limits</span>
    <p>Campaign count and applicant count are the natural place for the free-versus-Pro line, and the plan machinery already exists and reads its limits from settings rather than code. Decide the numbers when the feature is scoped; do not hard-code them.</p>
  </div>
</section>

<!-- 06 -->
<section id="carried">
  <span class="sec-num">06 — Items D–H</span>
  <h2>Carried over from the 19 August plan</h2>
  <p class="dek">Five features agreed for R1 in the earlier review, unchanged by this discussion. They share no dependencies with A, B or C and can be built in parallel by anyone free.</p>

  <div class="grid2">
    <div class="card">
      <h4>D · Creator level &amp; progress <span class="tag t-low">Low</span></h4>
      <p>Tiers derived from audience size, with a progress bar to the next one. The follower data is already collected and refreshed; nothing new needs storing. Build it on verified figures where they exist and mark it clearly as self-reported where they do not — a public badge is an incentive to inflate.</p>
    </div>
    <div class="card">
      <h4>E · Creating since <span class="tag t-low">Low</span></h4>
      <p>The year a creator started. One optional signup question, one column, one line on the profile. Small, but it is one of the few honest signals of experience that does not depend on follower count.</p>
    </div>
    <div class="card">
      <h4>F · Favourites &amp; saved <span class="tag t-low">Low</span></h4>
      <p>Brands save creators; creators save campaigns once C exists. Genuinely new, and the simplest kind of feature to add. It also gives a brand a reason to return before they are ready to spend.</p>
    </div>
    <div class="card">
      <h4>G · Networking funnel <span class="tag t-low">Low</span></h4>
      <p>Requests sent, accepted, converted to projects, completed. The statistics function already returns most of these from real records, including history. What is missing is a screen that shows them as a funnel.</p>
    </div>
    <div class="card hero">
      <h4>H · Reviews &amp; reputation <span class="tag t-med">Medium</span></h4>
      <p>Reviews already work end to end and only the two people who completed a project together can rate each other. Three additions: ask for the review at completion rather than hoping someone remembers, score on separate criteria instead of one star rating, and let creators rate brands — reputation that runs one way is worth much less to the side being judged.</p>
    </div>
  </div>
</section>

<!-- 07 -->
<section id="out">
  <span class="sec-num">07 — Not in Release 1</span>
  <h2>Deliberately left out</h2>
  <p class="dek">Recorded so they do not get re-litigated mid-build, and so nobody assumes they were forgotten.</p>

  <div class="grid2">
    <div class="card">
      <h4>Trending topics &amp; reels <span class="tag t-high">Blocked</span></h4>
      <p>Needs a paid data source. This is a purchasing decision first and a build second — built on unreliable data it produces a home screen that is confidently wrong, which is worse than not having one.</p>
    </div>
    <div class="card">
      <h4>Games &amp; quizzes <span class="tag t-later">Dropped</span></h4>
      <p>Lowest return on the list. A marketplace keeps people through deals, not gamification. Nobody with real traction in this market wins on it.</p>
    </div>
    <div class="card">
      <h4>Tax invoice, if unanswered <span class="tag t-med">Conditional</span></h4>
      <p>In R1 only if the supplier and GST question is answered in time. The receipt ships either way, so nothing is blocked by waiting.</p>
    </div>
    <div class="card">
      <h4>Turning subscriptions on <span class="tag t-later">Off</span></h4>
      <p>Plans, entitlements and checkout are built and disabled. Switching them on is a commercial decision and a separate release from this one.</p>
    </div>
  </div>

  <div class="call w">
    <span class="lbl">Outside the release, but ahead of it</span>
    <p>Two things block a public launch regardless of what R1 contains: <strong>email confirmation is switched off</strong>, so signup never verifies an address, and <strong>there is no production environment</strong> — what is named "production" in the configuration points at the staging database. Neither is a feature and neither belongs in this scope, but neither should be discovered after R1 is declared done.</p>
  </div>
</section>

<!-- 08 -->
<section id="questions">
  <span class="sec-num">08 — Open questions</span>
  <h2>What still needs an answer</h2>
  <ol>
    <li><strong>Tax invoice or receipt?</strong> Who is the supplier — Influnet or the creator? Until this is answered we build the receipt. <em>Owner: accounts.</em></li>
    <li><strong>Does a short-term project allow an advance?</strong> The proposal above is a single payment. Allowing an optional advance makes it a three-step flow and is worth a decision rather than an assumption.</li>
    <li><strong>Can a short-term project become a full one?</strong> Recommendation: no. Cancel and re-create instead. Converting mid-flight means reconciling stage history and a payment already taken.</li>
    <li><strong>Campaign limits.</strong> How many live campaigns per brand, how many applications per creator per week, and how long before a campaign expires.</li>
    <li><strong>Who moderates campaigns?</strong> Reviewed before publishing, or published immediately and taken down on report? Pre-moderation is safer and needs someone to actually do it every day.</li>
    <li><strong>Does an open campaign application count against the free conversion cap?</strong> The cap applies at project creation today. Applications are not projects, so the answer is probably no — but it should be said out loud.</li>
  </ol>
</section>

${remarksSection(base, 'release-1')}

<footer>
  <p><strong>Status.</strong> Draft for discussion, 24 August 2026. The classification in §2 comes from a direct read of the codebase and the applied migrations on that date and describes the web application; the mobile app covers the core loop but not every item marked built. Sections 3 to 5 describe intent, not implementation — none of it is written yet.</p>
  <p><strong>Supersedes.</strong> <a href="${base}/plan">Nine Features, Three Releases</a> (19 August 2026), which remains the reference for the competitor review and for the reasoning behind the release order.</p>
</footer>

${REPORT_THEMER}
</div>
`;
}
