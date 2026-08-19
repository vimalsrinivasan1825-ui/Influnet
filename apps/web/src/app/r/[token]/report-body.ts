/**
 * Body markup for the internal product-plan report served by ./route.ts.
 *
 * Kept as a string rather than a page component on purpose: this is a static
 * document with its own self-contained stylesheet, and routing it through the
 * app's layout would inherit the dashboard chrome it is not meant to have.
 *
 * Generated content — edit the source document, not this file.
 */
export const REPORT_BODY = String.raw`
<title>Nine Features, Three Releases</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">

<style>
:root{
  --surface:#f6f7f9; --card:#ffffff; --card-2:#fdf2f8;
  --hairline:#eef0f4; --hairline-strong:#e3e6ec;
  --content:#0f172a; --content-soft:#475569; --content-muted:#94a3b8;
  --brand:#ee3e96; --brand-2:#f26e59; --brand-strong:#d6358a; --brand-soft:#fdf2f8;
  --ok:#16a34a; --ok-soft:#f0fdf4; --warn:#d97706; --warn-soft:#fffbeb;
  --danger:#dc2626; --danger-soft:#fef2f2;
  --shadow:0 1px 2px rgba(15,23,42,.05), 0 10px 30px -22px rgba(238,62,150,.35);
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --surface:#100910; --card:#1a111a; --card-2:#241624;
    --hairline:#2c1f2c; --hairline-strong:#3a2a3a;
    --content:#f7eef4; --content-soft:#cbb8c5; --content-muted:#8d7a88;
    --brand:#f871b3; --brand-2:#f78a76; --brand-strong:#fda4c8; --brand-soft:#2e1626;
    --ok:#4ade80; --ok-soft:#12291b; --warn:#fbbf24; --warn-soft:#2c2110;
    --danger:#f87171; --danger-soft:#2e1414;
    --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -22px rgba(0,0,0,.9);
  }
}
:root[data-theme="dark"]{
  --surface:#100910; --card:#1a111a; --card-2:#241624;
  --hairline:#2c1f2c; --hairline-strong:#3a2a3a;
  --content:#f7eef4; --content-soft:#cbb8c5; --content-muted:#8d7a88;
  --brand:#f871b3; --brand-2:#f78a76; --brand-strong:#fda4c8; --brand-soft:#2e1626;
  --ok:#4ade80; --ok-soft:#12291b; --warn:#fbbf24; --warn-soft:#2c2110;
  --danger:#f87171; --danger-soft:#2e1414;
  --shadow:0 1px 2px rgba(0,0,0,.5), 0 10px 30px -22px rgba(0,0,0,.9);
}

*{box-sizing:border-box}
body{
  margin:0; background:var(--surface); color:var(--content);
  font-family:"Plus Jakarta Sans","Inter",system-ui,-apple-system,sans-serif;
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;
}
.wrap{max-width:1060px; margin:0 auto; padding:0 26px 100px}
h1,h2,h3,h4{text-wrap:balance; letter-spacing:-.02em; margin:0}
a{color:var(--brand-strong); text-underline-offset:2px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--brand); outline-offset:3px; border-radius:4px}
p{margin:0 0 14px} ul,ol{margin:0 0 14px; padding-left:20px} li{margin-bottom:6px}
strong{font-weight:700}

/* masthead */
header.mast{padding:60px 0 34px; border-bottom:2px solid var(--brand); margin-bottom:44px}
.eyebrow{font-size:11px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; color:var(--brand); margin:0 0 18px}
h1{font-size:clamp(36px,6vw,62px); line-height:1.03; font-weight:800; margin-bottom:16px}
h1 em{font-style:normal; color:var(--brand)}
.standfirst{font-size:18.5px; line-height:1.5; color:var(--content-soft); max-width:56ch; margin:0}

/* sections */
section{margin-top:64px; scroll-margin-top:16px}
.sec-num{display:inline-block; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
  color:var(--brand); background:var(--brand-soft); padding:4px 10px; border-radius:999px; margin-bottom:14px}
h2{font-size:clamp(24px,3.2vw,32px); font-weight:800; margin-bottom:8px}
.dek{color:var(--content-soft); font-size:16px; margin:0 0 26px; max-width:66ch}
h3{font-size:19px; font-weight:700; margin:34px 0 10px}
h4{font-size:15.5px; font-weight:700; margin:0 0 8px}

/* tags */
.tag{display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase;
  padding:3.5px 9px; border-radius:999px; white-space:nowrap; vertical-align:middle}
.t-low{background:var(--ok-soft); color:var(--ok)}
.t-med{background:var(--warn-soft); color:var(--warn)}
.t-high{background:var(--danger-soft); color:var(--danger)}
.t-r1{background:var(--brand); color:#fff}
.t-r2{background:var(--brand-soft); color:var(--brand-strong); box-shadow:inset 0 0 0 1px var(--brand)}
.t-r3{background:var(--card-2); color:var(--content-muted); box-shadow:inset 0 0 0 1px var(--hairline-strong)}

/* tables */
.tscroll{overflow-x:auto; margin:22px 0 26px; border:1px solid var(--hairline-strong); border-radius:14px;
  background:var(--card); box-shadow:var(--shadow)}
table{border-collapse:collapse; width:100%; min-width:600px}
th{font-size:10.5px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--content-muted);
  text-align:left; padding:14px 16px; border-bottom:1px solid var(--hairline-strong); background:var(--brand-soft); white-space:nowrap}
td{padding:14px 16px; border-bottom:1px solid var(--hairline); vertical-align:top; font-size:15px; line-height:1.5; color:var(--content-soft)}
tbody tr:last-child td{border-bottom:none}
td.nm{font-weight:700; color:var(--content); white-space:nowrap}
td.n{font-weight:700; color:var(--brand); font-variant-numeric:tabular-nums; width:34px}

/* release lanes */
.lane{display:grid; grid-template-columns:96px 1fr; gap:0 24px; margin-top:30px}
.lane-rail{position:relative}
.lane-id{font-size:15px; font-weight:800; color:#fff; background:var(--brand); display:inline-block;
  padding:5px 13px; border-radius:999px; letter-spacing:.02em}
.lane.two .lane-id{background:var(--brand-soft); color:var(--brand-strong); box-shadow:inset 0 0 0 1.5px var(--brand)}
.lane.three .lane-id{background:var(--card); color:var(--content-muted); box-shadow:inset 0 0 0 1.5px var(--hairline-strong)}
.lane-when{font-size:11px; font-weight:600; color:var(--content-muted); margin-top:8px; padding-left:2px}
.lane-rail::after{content:""; position:absolute; left:14px; top:46px; bottom:-30px; width:2px; background:var(--hairline-strong)}
.lane:last-child .lane-rail::after{display:none}
.lane-body{padding-bottom:22px}
.lane-body>h3:first-child{margin-top:0}

/* cards */
.card{background:var(--card); border:1px solid var(--hairline-strong); border-radius:14px; padding:18px 20px;
  box-shadow:var(--shadow)}
.card h4{display:flex; align-items:center; gap:9px; flex-wrap:wrap}
.card p:last-child,.card ul:last-child{margin-bottom:0}
.card p{font-size:15px; color:var(--content-soft)}
.grid2{display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:14px}
.card.hero{border-color:var(--brand); border-width:2px}

/* callout */
.call{border-left:4px solid var(--brand); background:var(--card); padding:16px 20px; border-radius:0 12px 12px 0;
  margin:20px 0; box-shadow:var(--shadow)}
.call.w{border-left-color:var(--warn)}
.call p{font-size:15px; color:var(--content-soft)} .call p:last-child{margin-bottom:0}
.call .lbl{display:block; font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:var(--brand); margin-bottom:8px}
.call.w .lbl{color:var(--warn)}

/* competitor blocks */
.arch{margin-top:30px; padding-top:22px; border-top:1px solid var(--hairline-strong)}
.arch>h3{margin:0 0 4px}
.arch-sub{font-size:13.5px; color:var(--content-muted); margin:0 0 6px; font-weight:600}
.comp{padding:14px 0; border-bottom:1px solid var(--hairline)}
.comp:last-child{border-bottom:none}
.comp-name{font-weight:800; font-size:16px; margin:0 0 6px; color:var(--content)}
.comp dl{display:grid; grid-template-columns:74px 1fr; gap:4px 14px; margin:0; font-size:15px}
.comp dt{font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--content-muted); padding-top:5px}
.comp dd{margin:0; color:var(--content-soft)}
.comp dd.take{color:var(--brand-strong); font-weight:600}

footer{margin-top:70px; border-top:1px solid var(--hairline-strong); padding-top:24px; font-size:13.5px; color:var(--content-muted)}
footer a{color:var(--content-muted)}
footer ul{columns:2; column-gap:34px; padding-left:16px}

@media (max-width:640px){
  .wrap{padding:0 16px 70px}
  .lane{grid-template-columns:1fr}
  .lane-rail{display:flex; align-items:center; gap:12px; margin-bottom:12px}
  .lane-when{margin-top:0}
  .lane-rail::after{display:none}
  footer ul{columns:1}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important; transition:none!important}}

/* theme toggle */
.themer{position:fixed; top:14px; right:14px; z-index:50; display:flex; align-items:center; gap:6px;
  background:var(--card); border:1px solid var(--hairline-strong); border-radius:999px; padding:4px;
  box-shadow:var(--shadow)}
.themer button{appearance:none; border:0; background:transparent; cursor:pointer; border-radius:999px;
  padding:6px 12px; font:inherit; font-size:12px; font-weight:700; color:var(--content-muted);
  letter-spacing:.02em; line-height:1}
.themer button[aria-pressed="true"]{background:var(--brand); color:#fff}
.themer button:focus-visible{outline:2px solid var(--brand); outline-offset:2px}
@media print{.themer{display:none}}
@media (max-width:640px){.themer{top:8px; right:8px}}
</style>

<div class="wrap">

<header class="mast">
  <p class="eyebrow">Influnet · Product plan · August 2026 · IST</p>
  <h1>Nine Features,<br><em>Three Releases</em></h1>
  <p class="standfirst">A build order for the nine ideas the team proposed, checked against what Influnet has already built — and what thirty competitors are doing that is worth copying.</p>
</header>

<!-- 01 -->
<section id="verdict">
  <span class="sec-num">01 — The short answer</span>
  <h2>What ships first</h2>
  <p class="dek">Five of the nine are small, because the hard part is already built and only the visible layer is missing. One is large but decides how the product grows. Three should wait.</p>

  <div class="tscroll">
  <table>
    <thead><tr><th></th><th>Feature</th><th>Release</th><th>Complexity</th><th>Why</th></tr></thead>
    <tbody>
      <tr><td class="n">5</td><td class="nm">Creator level &amp; progress</td><td><span class="tag t-r1">R1</span></td><td><span class="tag t-low">Low</span></td><td>Follower data is already collected. This is presentation only.</td></tr>
      <tr><td class="n">4</td><td class="nm">Creating since (year)</td><td><span class="tag t-r1">R1</span></td><td><span class="tag t-low">Low</span></td><td>One extra signup question and one line on the profile.</td></tr>
      <tr><td class="n">7</td><td class="nm">Favourites / saved</td><td><span class="tag t-r1">R1</span></td><td><span class="tag t-low">Low</span></td><td>Genuinely new, but the simplest kind of feature to add.</td></tr>
      <tr><td class="n">9</td><td class="nm">Networking funnel</td><td><span class="tag t-r1">R1</span></td><td><span class="tag t-low">Low</span></td><td>The platform already counts most of these numbers. It just never shows them.</td></tr>
      <tr><td class="n">8</td><td class="nm">Reviews &amp; reputation</td><td><span class="tag t-r1">R1</span></td><td><span class="tag t-med">Medium</span></td><td>Reviews already work end to end. Missing: the prompt to leave one, and ratings for brands.</td></tr>
      <tr><td class="n">2</td><td class="nm">Open campaigns</td><td><span class="tag t-r1">R1 ★</span></td><td><span class="tag t-med">Medium</span></td><td>The one real gap. Every competitor has it; we give creators no way to find work.</td></tr>
      <tr><td class="n">1</td><td class="nm">Invoice generator</td><td><span class="tag t-r2">R2</span></td><td><span class="tag t-med">Medium</span></td><td>Payment records exist, so the feature is straightforward — with one choice to make first.</td></tr>
      <tr><td class="n">3</td><td class="nm">Trending topics &amp; reels</td><td><span class="tag t-r3">R3</span></td><td><span class="tag t-high">High</span></td><td>Needs a paid data source. Blocked on budget, not on engineering.</td></tr>
      <tr><td class="n">6</td><td class="nm">Games &amp; quizzes</td><td><span class="tag t-r3">R3</span></td><td><span class="tag t-high">High</span></td><td>Lowest return on the list. A marketplace keeps users through deals, not quizzes.</td></tr>
    </tbody>
  </table>
  </div>

  <div class="call">
    <span class="lbl">Recommendation</span>
    <p><strong>Ship features 4, 5, 7, 8 and 9 together as one release, with open campaigns running alongside as its own workstream.</strong> The bundle is inexpensive because it mostly reveals information Influnet already holds — it makes profiles and the home screen feel finished. Open campaigns is the one that changes what the product <em>is</em>: until it exists, a creator with no active project has no reason to open the app.</p>
  </div>
</section>

<!-- 02 -->
<section id="leverage">
  <span class="sec-num">02 — Head start</span>
  <h2>What is already built</h2>
  <p class="dek">Several of the nine are much closer to finished than they appear. This is the difference between the estimates above and a from-scratch build.</p>

  <div class="tscroll">
  <table>
    <thead><tr><th>Idea</th><th>Already working</th><th>Still missing</th></tr></thead>
    <tbody>
      <tr><td class="nm">Reviews (8)</td><td>Star ratings and written reviews, restricted so only the two people who actually completed a project together can rate each other. Public average already shows on profiles.</td><td>Asking for the review at the right moment, scoring on separate criteria, and ratings for brands.</td></tr>
      <tr><td class="nm">Funnel (9)</td><td>Partners worked with, projects active, completed and cancelled, and accepted requests — all counted from real records, including history.</td><td>Two more counts and a screen to display the funnel.</td></tr>
      <tr><td class="nm">Levels (5)</td><td>Follower and subscriber counts for every connected platform, kept up to date.</td><td>The tier thresholds and the progress bar. Nothing needs storing.</td></tr>
      <tr><td class="nm">Invoices (1)</td><td>Every payment recorded with amount, stage, reference and a paid status that only a verified bank confirmation can set.</td><td>The document itself, and the decision in §4.</td></tr>
      <tr><td class="nm">Open campaigns (2)</td><td>Nothing. Today a brand can only approach one named creator at a time.</td><td>Campaign posting, applications, shortlisting — then it joins the existing project flow unchanged.</td></tr>
      <tr><td class="nm">Favourites (7)</td><td>Nothing.</td><td>All of it, but it is a small feature.</td></tr>
      <tr><td class="nm">Trending (3), Games (6)</td><td>Nothing.</td><td>Everything, plus a data source that has to be purchased.</td></tr>
    </tbody>
  </table>
  </div>
</section>

<!-- 03 -->
<section id="order">
  <span class="sec-num">03 — The plan</span>
  <h2>Three releases</h2>
  <p class="dek">Ordered by dependency and by competitive urgency, not by size.</p>

  <div class="lane">
    <div class="lane-rail"><span class="lane-id">R1</span><div class="lane-when">First release</div></div>
    <div class="lane-body">
      <h3>Show what exists, then open the front door</h3>
      <div class="grid2">
        <div class="card">
          <h4>4 · Creating since <span class="tag t-low">Low</span></h4>
          <p>An optional question at signup, shown on the profile as "Creating since 2019 · 7 years". Feeds the experience level and, later, brand search filters.</p>
          <p><strong>Keep it optional</strong> — a required field in a signup flow is a poor trade for a nice-to-have.</p>
        </div>
        <div class="card">
          <h4>5 · Creator level <span class="tag t-low">Low</span></h4>
          <p>Nano, Micro, Mid, Macro, Mega — derived from the creator's largest audience, with a progress bar: <em>8,420 / 10,000 · 1,580 to Micro</em>.</p>
          <p><strong>Show the level only where the follower count is verified.</strong> A self-typed number driving a public badge undermines the trust the platform sells.</p>
        </div>
        <div class="card">
          <h4>7 · Favourites <span class="tag t-low">Low</span></h4>
          <p>Save creators, brands and later campaigns for quick access, with one saved list in each app.</p>
          <p><strong>Keep saves private.</strong> Letting a creator see who bookmarked them is a different and far more sensitive feature.</p>
        </div>
        <div class="card">
          <h4>9 · Networking funnel <span class="tag t-low">Low</span></h4>
          <p>The creator's six-step pipeline: Requests → Accepted → Conversations → Discussions → Deals → Completed.</p>
          <p><strong>Calculate it from real records</strong> rather than keeping running totals — totals that a feature has to remember to update go quietly wrong.</p>
        </div>
        <div class="card">
          <h4>8 · Reviews, finished <span class="tag t-med">Medium</span></h4>
          <p>Three additions: ask both sides for a review when a project completes; optional scores for communication, professionalism, content quality and timeliness; and the same reputation for brands.</p>
          <p><strong>Decide the moderation route first.</strong> Reviews are permanent by design, and there is no takedown path today for one that crosses a line.</p>
        </div>
        <div class="card hero">
          <h4>2 · Open campaigns <span class="tag t-med">Medium</span></h4>
          <p>A brand posts a campaign, creators discover and apply, the brand shortlists, and accepting an application drops straight into the project pipeline that already exists.</p>
          <p><strong>Cut hard for the first version:</strong> post, list, apply, shortlist, convert. No ranking, no AI matching, no bulk hiring — those are v2.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="lane two">
    <div class="lane-rail"><span class="lane-id">R2</span><div class="lane-when">Second release</div></div>
    <div class="lane-body">
      <h3>Money documents and campaign depth</h3>
      <div class="grid2">
        <div class="card">
          <h4>1 · Invoice generator <span class="tag t-med">Medium</span></h4>
          <p>Everything the document needs is already recorded — agreed amount, advance and final split, payment reference, confirmed status. See §4 for the one choice to make before building.</p>
        </div>
        <div class="card">
          <h4>2b · Campaign depth <span class="tag t-med">Medium</span></h4>
          <p>Once campaigns have traffic: barter and product-seeding as a proper deal type, clearer deliverable specs on the brief, saved campaigns, and application status alerts.</p>
          <p><strong>Barter matters in India</strong> — a large share of competitor volume is product-only, and the current terms assume cash.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="lane three">
    <div class="lane-rail"><span class="lane-id">R3</span><div class="lane-when">Later</div></div>
    <div class="lane-body">
      <h3>The two that need a decision before a developer</h3>
      <div class="grid2">
        <div class="card">
          <h4>3 · Trending topics <span class="tag t-high">Needs budget</span></h4>
          <p>Desirable, and several competitors use trend content to keep creators coming back. The obstacle is data: our current plan cannot supply reliable trending or view figures, and scraping it is fragile and against platform terms.</p>
          <p><strong>The strong interim version:</strong> publish trends from data Influnet already owns — which niches are attracting the most brand requests, which formats live briefs ask for, which budget bands are moving. No competitor can copy that, because none of them have our deal data.</p>
        </div>
        <div class="card">
          <h4>6 · Games &amp; quizzes <span class="tag t-high">Recommend cutting</span></h4>
          <p>Games lift daily-active numbers on paper and rarely lift the one that matters — a creator returning because there is money on the table. They also create a content surface someone must refresh forever.</p>
          <p><strong>Cheaper substitute:</strong> profile completion, verification streaks and the "1,580 followers to Micro" nudge from feature 5. Same pull, a fraction of the cost, and every part of it points the creator at paid work. If retention is the real goal, workshops and creator education are the higher-return spend — that is what the strongest Indian competitors actually do.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 04 -->
<section id="decisions">
  <span class="sec-num">04 — Decisions needed</span>
  <h2>Four things to settle before building</h2>

  <div class="call">
    <span class="lbl">1 · Invoices — yes, there is a simpler alternative</span>
    <p>A proper <strong>tax invoice</strong> is a legal document: it needs a gapless numbering series, GST details, and a clear answer to who the supplier is — Influnet or the creator. That is a question for whoever handles the accounts, not for the development team.</p>
    <p><strong>The alternative, and it is a good one:</strong> issue a <strong>payment receipt / statement</strong> instead — a clean, branded record of what was agreed and what was paid, downloadable by both sides, generated from payment data that is already verified. It solves the actual user need (proof of the deal and its payments) with none of the tax exposure, and it can ship in R2 without waiting on anyone. The tax invoice can follow later once the supplier question is answered.</p>
  </div>

  <div class="call w">
    <span class="lbl">2 · Campaigns need spam controls from day one</span>
    <p>Today a brand can only approach one creator at a time, which naturally limits noise. An open campaign board removes that limit by design. Before launch: a cap on live campaigns per brand, a minimum standard for the brief, a way to report a campaign, and admin visibility. Approved brands being careless is the realistic risk, not bad actors getting in.</p>
  </div>

  <div class="call w">
    <span class="lbl">3 · Trending is a purchasing decision</span>
    <p>Treat feature 3 as a budget question first and a build second. Building it on unreliable data produces a home screen that is confidently wrong, which is worse than not having one.</p>
  </div>

  <div class="call w">
    <span class="lbl">4 · Public numbers raise the incentive to inflate</span>
    <p>Feature 5 turns a follower count into a public badge and feature 9 turns collaboration history into a public funnel. Both need to be built on verified figures where they exist, and clearly marked as self-reported where they do not.</p>
  </div>
</section>

<!-- 05 -->
<section id="landscape">
  <span class="sec-num">05 — Competitors</span>
  <h2>Thirty platforms, six groups</h2>
  <p class="dek">What each one does differently, and the single thing worth taking from it. Based on public marketing, app listings and press coverage — read as positioning, not verified fact.</p>

  <div class="arch">
    <h3>A · Direct networks — our closest analogues</h3>
    <p class="arch-sub">They reject the agency model and sell verified brand-to-creator access. Our own thesis, run by other people.</p>

    <div class="comp"><p class="comp-name">HashFame</p><dl>
      <dt>Does</dt><dd>Manually verifies every creator and brand before entry. Rate cards on profiles, one inbox for chats and briefs, an availability signal, profile-view insights. Free for both sides; monetises paid direct phone and WhatsApp access.</dd>
      <dt class="take">Take</dt><dd class="take">Rate cards on the public profile — and treating verification as the way in, rather than an optional badge. Their trust story is one Influnet can already tell but does not.</dd></dl></div>

    <div class="comp"><p class="comp-name">Collebrity <span style="font-weight:500;color:var(--content-muted);font-size:13px">· Bangalore</span></p><dl>
      <dt>Does</dt><dd>Treats the <strong>talent manager</strong> as a full role beside creators and brands, with protected payments and analytics-led discovery.</dd>
      <dt class="take">Take</dt><dd class="take">The manager role. Above roughly 100k followers, Indian creators are represented and the manager answers the messages — Influnet has no seat for that person, which quietly caps the tier of creator we can serve.</dd></dl></div>

    <div class="comp"><p class="comp-name">Braccet</p><dl>
      <dt>Does</dt><dd>Profile, category browse, match, message. Mobile-first, and shallower than Influnet on every axis.</dd>
      <dt class="take">Take</dt><dd class="take">Nothing — but it is useful proof that profiles-and-messaging alone is not defensible. Depth after the handshake is.</dd></dl></div>
  </div>

  <div class="arch">
    <h3>B · Fixed-price booking marketplaces</h3>
    <p class="arch-sub">Collabstr · Ainfluencer · CollabMarket</p>

    <div class="comp"><p class="comp-name">Collabstr</p><dl>
      <dt>Does</dt><dd>Creators publish priced packages — "one video, this price" — and brands buy them like products, searchable by platform, niche, audience and price. Brand funds are held and released on approval.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>Price on the profile.</strong> Turns browsing into a transaction with no negotiation round-trip. Influnet already collects pricing at signup and simply does not publish it.</dd></dl></div>

    <div class="comp"><p class="comp-name">Ainfluencer</p><dl>
      <dt>Does</dt><dd>Free to both sides, paid from the creator's payout. Brands invite or match, both sides negotiate inside chat, funds are held safely, a resolution centre handles disputes, reviews close the loop.</dd>
      <dt class="take">Take</dt><dd class="take">Offers as a proper object inside the conversation rather than free text — and a visible <strong>dispute process</strong>, which is the first thing a cautious brand asks about and which Influnet does not advertise.</dd></dl></div>
  </div>

  <div class="arch">
    <h3>C · India campaign networks — the volume players</h3>
    <p class="arch-sub">Every platform here is built around the exact feature we are missing: a feed of live work a creator can apply to.</p>

    <div class="comp"><p class="comp-name">Kofluence</p><dl>
      <dt>Does</dt><dd>Scale — 750,000+ creators. App-first: browse campaigns, apply, submit content, get paid on approval, with data-led discovery on the brand side.</dd>
      <dt class="take">Take</dt><dd class="take">The three screens the market now expects of a creator app: apply, track status, see earnings.</dd></dl></div>

    <div class="comp"><p class="comp-name">Uptrendly</p><dl>
      <dt>Does</dt><dd>Two campaign modes — <strong>open</strong> (creators pitch at the brand's rate) and <strong>customised</strong> (the brand approaches named creators at the creator's rate). Work starts only after both sides approve.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>The right shape for feature 2.</strong> Influnet already has the "customised" half. Adding open campaigns completes a model that is half-built rather than bolting on a second product.</dd></dl></div>

    <div class="comp"><p class="comp-name">ViralPitch</p><dl>
      <dt>Does</dt><dd>Self-serve from discovery through to payment and reporting in one dashboard, with paid, barter and product-sampling campaigns — and <strong>WhatsApp</strong> as a brand-to-creator channel.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>WhatsApp notifications.</strong> In India, push and email alone do not reach people. Influnet's alerts system is already built and proven; adding a channel is far cheaper than building it was.</dd></dl></div>

    <div class="comp"><p class="comp-name">Cloutin</p><dl>
      <dt>Does</dt><dd>Verification is compulsory before applying to anything, plus an in-app earnings wallet with self-serve withdrawal.</dd>
      <dt class="take">Take</dt><dd class="take">Verification as the gate to opportunity. "Verify to apply" converts far better than "verify for a badge" — and Influnet's verification is stronger than theirs, it is just asked for at a moment when the creator wants nothing.</dd></dl></div>

    <div class="comp"><p class="comp-name">Collabzi · CollabKaroo · Trendly · Solo for Creators</p><dl>
      <dt>Does</dt><dd><strong>Collabzi:</strong> "no minimum followers" as the whole promise, plus fast payouts. <strong>CollabKaroo:</strong> creator network with workshops and portfolio building. <strong>Trendly:</strong> matching, paid and barter, deal tracking with deadlines. <strong>Solo:</strong> pays creators per view rather than a flat fee.</dd>
      <dt class="take">Take</dt><dd class="take">CollabKaroo's <strong>workshops</strong> — this is what feature 6 was reaching for, and it attracts the audience we actually want. And Collabzi's "no minimum followers" line, which is already true of Influnet and is not being said.</dd></dl></div>

    <div class="comp"><p class="comp-name">Good Creator Co · Infloso · InfluCollabs</p><dl>
      <dt>Does</dt><dd><strong>GCC:</strong> "learn, earn, collaborate" at 1.5M creators — education and trend guidance alongside campaigns. <strong>Infloso:</strong> AI matching with brand-safety screening. <strong>InfluCollabs:</strong> agency-led managed service.</dd>
      <dt class="take">Take</dt><dd class="take">GCC's <strong>education layer</strong> is the credible version of feature 3 — trends delivered as guidance. It needs an editor, not a data pipeline.</dd></dl></div>
  </div>

  <div class="arch">
    <h3>D · Global brand-side platforms</h3>
    <p class="arch-sub">Not competitors for Indian creators — but a preview of the mature shape of what we are building.</p>

    <div class="comp"><p class="comp-name">Aspire</p><dl>
      <dt>Does</dt><dd>Runs both directions at once: brands post campaigns and creators apply, <em>and</em> brands search a million-plus creator marketplace. Plus rights management for reusing creator content in ads.</dd>
      <dt class="take">Take</dt><dd class="take">The clearest argument for feature 2 — and <strong>usage rights as an explicit part of the deal</strong>, which Influnet's agreed terms do not capture and which is a common source of conflict after delivery.</dd></dl></div>

    <div class="comp"><p class="comp-name">Insense</p><dl>
      <dt>Does</dt><dd>Briefs with fixed objectives and asset specifications, payment released on approval, automatic agreements, and content pushed straight into ad accounts.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>Specific deliverables on the brief</strong> — format, length, platform, posting window. It turns "the content isn't good enough" arguments into a checkable list.</dd></dl></div>

    <div class="comp"><p class="comp-name">Upfluence · IZEA</p><dl>
      <dt>Does</dt><dd><strong>Upfluence:</strong> finds influencers hiding inside a brand's own customer list, plus per-creator promo codes for tracking sales. <strong>IZEA:</strong> flat low-cost creator payments and a single ledger covering off-platform spend such as gifting and event costs.</dd>
      <dt class="take">Take</dt><dd class="take">IZEA's <strong>ledger framing</strong> is the natural home for feature 1 — an invoice is one view of a project's money record, and that framing makes barter and product value representable instead of awkward.</dd></dl></div>
  </div>

  <div class="arch">
    <h3>E · Creator monetisation &amp; commerce</h3>
    <p class="arch-sub">Wishlink · Influish · LinkPlease</p>

    <div class="comp"><p class="comp-name">Wishlink <span style="font-weight:500;color:var(--content-muted);font-size:13px">· raised $17.5M</span></p><dl>
      <dt>Does</dt><dd>Creator commerce rather than campaigns — affiliate storefronts across 250+ brands, automated comment-to-DM product links, and a paid collabs feed on top. Their real advantage is knowing which products each creator's audience actually buys.</dd>
      <dt class="take">Take</dt><dd class="take">Not the automation — the lesson. <strong>Outcome data is the durable advantage</strong>, and ours is completed-project and payment history that no competitor has. Features 8 and 9 are the start of making it visible.</dd></dl></div>

    <div class="comp"><p class="comp-name">Influish</p><dl>
      <dt>Does</dt><dd>Connects Instagram through <strong>official Meta APIs</strong> for verified reach, engagement and average views — rather than scraping — plus AI content tools and zero commission as the brand hook.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>The most valuable item on this page.</strong> Official API access solves the exact data problem blocking our metrics work, makes feature 5's levels trustworthy and makes part of feature 3 possible from first-party data. It is an approval process, so it needs starting well before we need it.</dd></dl></div>

    <div class="comp"><p class="comp-name">LinkPlease</p><dl>
      <dt>Does</dt><dd>Instagram DM automation and link-in-bio pages. Adjacent rather than competing.</dd>
      <dt class="take">Take</dt><dd class="take">Nothing — see the do-not-copy list.</dd></dl></div>
  </div>

  <div class="arch">
    <h3>F · Creator business tools</h3>
    <p class="arch-sub">These sell straight to the creator, and they are the direct precedent for feature 1.</p>

    <div class="comp"><p class="comp-name">Jem Social</p><dl>
      <dt>Does</dt><dd>Built explicitly against "spreadsheets, DMs and invoices": an opportunities board, AI-personalised pitches, full contract templates, and protected payment so creators are not chasing brands.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>Contract templates.</strong> Influnet records agreed terms carefully but produces no document either side can keep — and the same generator serves feature 1.</dd></dl></div>

    <div class="comp"><p class="comp-name">Hey!Creators · Creatorloop</p><dl>
      <dt>Does</dt><dd><strong>Hey!Creators:</strong> invoice generation, media kit, reports, curated industry news, AI content ideas. <strong>Creatorloop:</strong> a brand directory plus one-click media-kit export carrying all the creator's stats.</dd>
      <dt class="take">Take</dt><dd class="take"><strong>Media kit export.</strong> Influnet already holds everything a media kit contains — verified audience, niches, portfolio with proof, rates, completed projects, rating. Turning it into a shareable page or PDF gives every creator a reason to link back to us from outside the platform. It is the cheapest growth loop on this list.</dd></dl></div>
  </div>

  <div class="call w">
    <span class="lbl">Not verifiable</span>
    <p>Three names — <strong>Social Celebrity</strong>, <strong>Collabs</strong> and <strong>Social Collab</strong> — did not resolve to a specific product in public search; the terms are too generic. Send links and we will add them. The search also surfaced <strong>Collabr</strong>, <strong>CollabMarket</strong>, <strong>Collabuzz</strong>, <strong>Collabzy</strong> and <strong>Cloutaura</strong> — all Indian entrants with near-identical pitches, which is itself the finding in §6.</p>
  </div>
</section>

<!-- 06 -->
<section id="position">
  <span class="sec-num">06 — Where we stand</span>
  <h2>One gap, one advantage</h2>

  <h3>The gap: creators cannot find work</h3>
  <p>All thirty platforms let a creator see work they can apply for. Influnet does not — requests only travel from an approved brand to a named creator, so a creator with no active project has nothing to do in the app. That is the retention problem, and it is why feature 6 came up at all. <strong>Feature 2 is the answer to feature 6.</strong></p>
  <p>It also caps growth on the creator side: the standard acquisition pitch in this market — "no minimum followers, apply to campaigns today" — is a promise we currently cannot make.</p>

  <h3>The advantage: nobody else requires both sides to agree</h3>
  <p>Across the whole list, the deepest workflow anyone offers is brief, apply, approve, deliver, approve, release payment. Uptrendly's "both parties approve" is the closest thing to our model, and it applies once, at the start.</p>
  <p>Influnet runs twelve stages, most of which need <em>both</em> sides to sign off before the project moves, with payment gates that open only on a verified payment rather than someone ticking a box. That is a materially stronger guarantee than the market standard — and it is invisible in how we present ourselves. Two consequences:</p>
  <ul>
    <li><strong>Sell it.</strong> "Neither side can move the project alone, and no payment stage opens without a verified payment" is a sentence no competitor on this list can write. It belongs on the landing page and in the brand pitch, not buried inside the project screen.</li>
    <li><strong>Do not dilute it when campaigns arrive.</strong> The pressure will be to add a fast lane — auto-accept, bulk hire, one-click booking. Route applications into the existing flow instead. The rigour is the product.</li>
  </ul>

  <h3>The market reading</h3>
  <p>The Indian category is crowded at the shallow end and thin at the deep end. A dozen near-identical apps offer a campaign feed, matching and protected payments. Almost nobody offers a real workflow <em>after</em> the deal is agreed — which is exactly where collaborations fail, and exactly where Influnet is strongest.</p>
  <p><strong>The position: match them at the front door — campaigns, rate cards, media kits, apply-to-work — and beat them decisively after the handshake.</strong> Do not compete on creator-count claims; every platform inflates them and it is not a winnable fight.</p>
</section>

<!-- 07 -->
<section id="take">
  <span class="sec-num">07 — The take list</span>
  <h2>What to borrow, in order</h2>

  <div class="tscroll">
  <table>
    <thead><tr><th></th><th>Take this</th><th>From</th><th>Complexity</th><th>Why it earns its place</th></tr></thead>
    <tbody>
      <tr><td class="n">1</td><td class="nm">Open campaigns</td><td>Uptrendly, Aspire, Kofluence</td><td><span class="tag t-med">Medium</span></td><td>Closes the only structural gap. Nothing else here matters as much.</td></tr>
      <tr><td class="n">2</td><td class="nm">Media kit export</td><td>Creatorloop, Hey!Creators</td><td><span class="tag t-low">Low</span></td><td>All the data exists. Every export links a creator back to Influnet from wherever they pitch.</td></tr>
      <tr><td class="n">3</td><td class="nm">Rate cards on profile</td><td>Collabstr, HashFame</td><td><span class="tag t-low">Low</span></td><td>Pricing is already collected. Publishing it removes a negotiation round-trip per deal.</td></tr>
      <tr><td class="n">4</td><td class="nm">Verify-to-apply</td><td>Cloutin</td><td><span class="tag t-low">Low</span></td><td>Reuses verification that is better than theirs but currently asked for at the wrong moment.</td></tr>
      <tr><td class="n">5</td><td class="nm">Official Meta API data</td><td>Influish</td><td><span class="tag t-high">Long lead</span></td><td>Fixes our metrics problem at the root and unblocks three separate features. Start the approval early.</td></tr>
      <tr><td class="n">6</td><td class="nm">WhatsApp notifications</td><td>ViralPitch</td><td><span class="tag t-low">Low</span></td><td>The alerts system exists; this is one more channel, on the surface Indian creators actually check.</td></tr>
      <tr><td class="n">7</td><td class="nm">Barter as a deal type</td><td>Trendly, Cloutin</td><td><span class="tag t-med">Medium</span></td><td>A large share of Indian collaboration volume is product-only; our terms assume cash.</td></tr>
      <tr><td class="n">8</td><td class="nm">Structured offers in chat</td><td>Ainfluencer</td><td><span class="tag t-med">Medium</span></td><td>Captures agreed terms at the moment of agreement instead of reconstructing them later.</td></tr>
      <tr><td class="n">9</td><td class="nm">Deliverable specs on briefs</td><td>Insense</td><td><span class="tag t-low">Low</span></td><td>Turns subjective delivery disputes into a checkable list.</td></tr>
      <tr><td class="n">10</td><td class="nm">Contracts &amp; receipts</td><td>Jem, IZEA</td><td><span class="tag t-med">Medium</span></td><td>Feature 1, framed as a money record rather than a tax document.</td></tr>
      <tr><td class="n">11</td><td class="nm">Talent-manager role</td><td>Collebrity</td><td><span class="tag t-high">High</span></td><td>Unlocks creators above ~100k who do not manage their own inbox. Plan it properly.</td></tr>
      <tr><td class="n">12</td><td class="nm">Workshops &amp; education</td><td>CollabKaroo, GCC</td><td><span class="tag t-low">Low code</span></td><td>The retention mechanism feature 6 was reaching for, at a fraction of the cost.</td></tr>
    </tbody>
  </table>
  </div>

  <h3>What not to copy</h3>
  <ul>
    <li><strong>Instagram DM automation.</strong> It sits against Meta's rules unless built on sanctioned APIs, and the penalty lands on the creator's account, not ours. A platform that gets creators restricted does not recover.</li>
    <li><strong>Selling direct phone and WhatsApp access to creators.</strong> Commercially effective, privacy-hostile, and against every other choice this product has made.</li>
    <li><strong>Inflated creator-count claims.</strong> "750,000 creators", "5M influencers" are database counts, not active supply. Competing there means matching a number we cannot verify with a product we can.</li>
    <li><strong>Games and quizzes</strong> — including the versions competitors ship. Nobody with real traction in this market wins on gamification.</li>
  </ul>
</section>

<!-- 08 -->
<section id="next">
  <span class="sec-num">08 — Next steps</span>
  <h2>What to do this week</h2>
  <ol>
    <li><strong>Answer the invoice question</strong> — tax invoice or payment receipt. If the answer is "keep it simple", we build the receipt in R2 and nothing is blocked.</li>
    <li><strong>Scope open campaigns on paper</strong> before any code, so the spam controls and the plan limits are designed in rather than discovered.</li>
    <li><strong>Start the Meta API application.</strong> Longest lead time on this page, and it unblocks three features.</li>
    <li><strong>Ship the first bundle in parallel.</strong> Features 4, 5, 7, 8 and 9 have no open questions and no dependencies.</li>
    <li><strong>Send links for the three unidentified competitors</strong> so the review is complete.</li>
  </ol>
</section>

<footer>
  <p><strong>Method.</strong> Feature assessments come from a direct review of the Influnet codebase and database. Competitor findings come from public marketing pages, app-store listings and press coverage retrieved August 2026, and describe how each platform positions itself rather than verified behaviour.</p>
  <p><strong>Sources</strong></p>
  <ul>
    <li><a href="https://collebrity.com/">Collebrity</a></li>
    <li><a href="https://getcreatorloop.com/">Creatorloop</a></li>
    <li><a href="https://www.wishlink.com/">Wishlink</a></li>
    <li><a href="https://linkplease.co/pricing">LinkPlease</a></li>
    <li><a href="https://influish.com/">Influish</a></li>
    <li><a href="https://collabstr.com/">Collabstr</a></li>
    <li><a href="https://ainfluencer.com/how-it-works-page-ainfluencer/">Ainfluencer</a></li>
    <li><a href="https://www.aspire.io/">Aspire</a></li>
    <li><a href="https://www.upfluence.com/guides/upfluence-live-capture-tool-tutorial">Upfluence</a></li>
    <li><a href="https://izea.com/flex/pay-influencers/">IZEA</a></li>
    <li><a href="https://www.kofluence.com/">Kofluence</a></li>
    <li><a href="https://insense.pro/platform/creator-marketplace">Insense</a></li>
    <li><a href="https://www.mediainfoline.com/techno/the-good-creator-co-launches-indias-largest-creator-app-a-one-stop">Good Creator Co</a></li>
    <li><a href="https://apps.apple.com/in/app/collabkaroo-creator-network/id6753695343">CollabKaroo</a></li>
    <li><a href="https://apps.apple.com/in/app/hey-creators/id1549437805">Hey!Creators</a></li>
    <li><a href="https://apps.apple.com/us/app/braccet/id6765917658">Braccet</a></li>
    <li><a href="https://influcollabs.com/">InfluCollabs</a></li>
    <li><a href="https://www.jem.social/earn-money-as-a-creator">Jem Social</a></li>
    <li><a href="https://creators.trendly.now/">Trendly</a></li>
    <li><a href="https://www.uptrendly.com/">Uptrendly</a></li>
    <li><a href="https://viralpitch.co/">ViralPitch</a></li>
    <li><a href="https://apps.apple.com/in/app/solo-for-creators/id6615079171">Solo for Creators</a></li>
    <li><a href="https://play.google.com/store/apps/details?id=collabzi.influencer.marketing">Collabzi</a></li>
    <li><a href="https://cloutin.co/">Cloutin</a></li>
    <li><a href="https://www.infloso.ai/">Infloso</a></li>
    <li><a href="https://play.google.com/store/apps/details?id=com.qoruz.nexus">HashFame</a></li>
  </ul>
</footer>


<div class="themer" role="group" aria-label="Colour theme">
  <button type="button" data-set="light" aria-pressed="false">Light</button>
  <button type="button" data-set="system" aria-pressed="true">Auto</button>
  <button type="button" data-set="dark" aria-pressed="false">Dark</button>
</div>
<script>
(function(){
  var KEY = "influnet-report-theme";
  var root = document.documentElement;
  function apply(mode){
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    var btns = document.querySelectorAll(".themer button");
    for (var i = 0; i < btns.length; i++){
      btns[i].setAttribute("aria-pressed", String(btns[i].dataset.set === mode));
    }
  }
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  apply(saved === "light" || saved === "dark" ? saved : "system");
  document.querySelector(".themer").addEventListener("click", function(ev){
    var btn = ev.target.closest("button[data-set]");
    if (!btn) return;
    var mode = btn.dataset.set;
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply(mode);
  });
})();
</script>
</div>
`;
