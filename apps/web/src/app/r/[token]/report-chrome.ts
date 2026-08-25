/**
 * Chrome shared by every document served under /r/<token>: the webfont links,
 * the stylesheet, and the light/dark toggle.
 *
 * Extracted from report-body.ts when the single report became a small library
 * of documents (an index of cards, the nine-feature plan, the Release 1 scope).
 * Three copies of a 150-line stylesheet would have drifted within a week.
 *
 * Only Google Fonts is loaded from outside; everything else is inline, so the
 * documents render the same wherever they are opened.
 */
export const REPORT_HEAD = String.raw`
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
/* ── index of documents ───────────────────────────────────────────── */
.docgrid{display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:20px; margin-top:38px}
a.doccard{display:block; text-decoration:none; color:inherit; background:var(--card);
  border:1px solid var(--hairline-strong); border-radius:18px; padding:26px 26px 24px;
  box-shadow:var(--shadow); transition:transform .16s ease, border-color .16s ease}
a.doccard:hover{transform:translateY(-3px); border-color:var(--brand)}
a.doccard:focus-visible{outline:2px solid var(--brand); outline-offset:3px}
.doccard .kicker{display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:16px}
.doccard .date{font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--content-muted)}
.doccard h3{font-size:25px; font-weight:800; margin:0 0 10px; letter-spacing:-.02em; color:var(--content)}
.doccard p{font-size:15px; color:var(--content-soft); margin:0 0 16px}
.doccard ul{margin:0 0 16px; padding-left:18px; font-size:14.5px; color:var(--content-soft)}
.doccard .go{font-size:13.5px; font-weight:700; color:var(--brand-strong); display:inline-flex; align-items:center; gap:6px}
a.doccard.primary{border-color:var(--brand); border-width:2px; background:linear-gradient(180deg,var(--card-2),var(--card) 58%)}

/* ── document nav (back to index) ─────────────────────────────────── */
.docnav{padding-top:26px; font-size:13px; font-weight:700; letter-spacing:.02em}
.docnav a{color:var(--content-muted); text-decoration:none}
.docnav a:hover{color:var(--brand-strong)}

/* ── build-status pills, used to classify every feature ───────────── */
.t-built{background:var(--ok-soft); color:var(--ok)}
.t-partial{background:var(--warn-soft); color:var(--warn)}
.t-new{background:var(--brand); color:#fff}
.t-later{background:var(--card-2); color:var(--content-muted); box-shadow:inset 0 0 0 1px var(--hairline-strong)}
td.st{white-space:nowrap; width:1%}

/* ── numbered build steps ─────────────────────────────────────────── */
ol.steps{list-style:none; padding:0; margin:20px 0 0; counter-reset:step}
ol.steps>li{counter-increment:step; position:relative; padding:0 0 20px 46px; margin:0}
ol.steps>li::before{content:counter(step); position:absolute; left:0; top:0; width:30px; height:30px;
  border-radius:999px; background:var(--brand-soft); color:var(--brand-strong);
  box-shadow:inset 0 0 0 1.5px var(--brand); font-size:13px; font-weight:800;
  display:flex; align-items:center; justify-content:center}
ol.steps>li>strong{display:block; font-size:16px; color:var(--content); margin-bottom:4px}
ol.steps>li>span{font-size:15px; color:var(--content-soft)}

/* ── side-by-side comparison ──────────────────────────────────────── */
.vs{display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin:22px 0}
.vs>div{background:var(--card); border:1px solid var(--hairline-strong); border-radius:14px;
  padding:20px; box-shadow:var(--shadow)}
.vs>div.pick{border-color:var(--brand); border-width:2px}
.vs h4{font-size:17px; margin-bottom:4px}
.vs .meta{font-size:11px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
  color:var(--content-muted); margin:0 0 12px}
.vs ul{margin:0; padding-left:18px; font-size:14.5px; color:var(--content-soft)}

/* ── remarks ──────────────────────────────────────────────────────── */
.remarks{margin-top:26px; background:var(--card); border:1px solid var(--hairline-strong);
  border-radius:16px; padding:22px; box-shadow:var(--shadow)}
.remarks label{display:block; font-size:11px; font-weight:700; letter-spacing:.1em;
  text-transform:uppercase; color:var(--content-muted); margin:0 0 7px}
.remarks input,.remarks select,.remarks textarea{
  width:100%; font:inherit; font-size:15px; color:var(--content); background:var(--surface);
  border:1px solid var(--hairline-strong); border-radius:10px; padding:11px 13px; margin-bottom:16px}
.remarks textarea{min-height:120px; resize:vertical; line-height:1.55}
.remarks input:focus,.remarks select:focus,.remarks textarea:focus{
  outline:2px solid var(--brand); outline-offset:1px; border-color:var(--brand)}
.remarks .row{display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:0 16px}
.remarks button{appearance:none; border:0; background:var(--brand); color:#fff; font:inherit;
  font-size:15px; font-weight:700; padding:12px 24px; border-radius:999px; cursor:pointer}
.remarks button:hover{background:var(--brand-strong)}
.remarks button:disabled{opacity:.55; cursor:progress}
.remarks button:focus-visible{outline:2px solid var(--content); outline-offset:2px}
.remarks .hint{font-size:13px; color:var(--content-muted); margin:12px 0 0}
.remarks .say{font-size:14px; font-weight:600; margin:14px 0 0; min-height:20px}
.remarks .say.ok{color:var(--ok)} .remarks .say.bad{color:var(--danger)}
.thread{margin-top:26px; display:flex; flex-direction:column; gap:12px}
.note{background:var(--card); border:1px solid var(--hairline-strong); border-left:3px solid var(--brand);
  border-radius:0 12px 12px 0; padding:14px 18px}
.note .who{font-size:13px; font-weight:700; color:var(--content)}
.note .when{font-size:11.5px; color:var(--content-muted); font-weight:600}
.note p{font-size:14.5px; color:var(--content-soft); margin:8px 0 0; white-space:pre-wrap}
.thread .empty{font-size:14px; color:var(--content-muted); font-style:italic}
</style>
`;

/**
 * The floating Light / Auto / Dark control. Reads and writes the same
 * localStorage key the pre-paint script in route.ts reads, so a choice made on
 * one document holds across all of them without a flash on navigation.
 */
export const REPORT_THEMER = String.raw`
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
`;

/**
 * The reader-remarks block: a form and the remarks already left on this
 * document. Parameterised by `doc` so any document can carry one.
 *
 * Rendered empty and filled by fetch rather than server-rendered with the
 * remarks inlined, because the document responses are `no-store` but still sit
 * behind whatever proxy is in front of the container; loading the thread
 * client-side means a reader always sees the current state, and a failure to
 * reach the endpoint degrades to an empty thread rather than a broken page.
 *
 * Everything a reader submits is escaped on render — see `esc` below. This is
 * an unauthenticated form on a shared link, so remark text is untrusted input.
 */
export function remarksSection(base: string, doc: string): string {
  return String.raw`
<section id="remarks">
  <span class="sec-num">Your turn</span>
  <h2>Leave a remark</h2>
  <p class="dek">Disagreements are more useful than approvals. If something here is wrong, missing, or scoped bigger than it needs to be, say so — this is a draft and it is meant to change.</p>

  <div class="remarks">
    <form id="remark-form">
      <div class="row">
        <div>
          <label for="rm-author">Your name <span style="text-transform:none;letter-spacing:0;font-weight:600">(optional)</span></label>
          <input id="rm-author" name="author" type="text" maxlength="80" autocomplete="name" placeholder="Who is this from?">
        </div>
        <div>
          <label for="rm-kind">Kind of remark</label>
          <select id="rm-kind" name="kind">
            <option value="suggestion">Suggestion</option>
            <option value="question">Question</option>
            <option value="concern">Concern — this looks wrong</option>
            <option value="agree">Agreement / support</option>
          </select>
        </div>
      </div>
      <label for="rm-topic">Which part? <span style="text-transform:none;letter-spacing:0;font-weight:600">(optional)</span></label>
      <input id="rm-topic" name="topic" type="text" maxlength="120" placeholder="e.g. Short-term projects, Invoices, Open campaigns">
      <label for="rm-body">Your remark</label>
      <textarea id="rm-body" name="body" maxlength="4000" required placeholder="What would you change, and why?"></textarea>
      <button type="submit">Post remark</button>
      <p class="say" id="rm-say" role="status" aria-live="polite"></p>
      <p class="hint">Remarks are visible to everyone with this link and cannot be edited or deleted once posted. Nothing here is private — do not paste anything confidential.</p>
    </form>
  </div>

  <div class="thread" id="rm-thread"><p class="empty">Loading remarks…</p></div>
</section>

<script>
(function(){
  var ENDPOINT = "__BASE__/remarks?doc=__DOC__";
  var form   = document.getElementById("remark-form");
  var say    = document.getElementById("rm-say");
  var thread = document.getElementById("rm-thread");
  var btn    = form.querySelector("button[type=submit]");

  var LABEL = { suggestion:"Suggestion", question:"Question", concern:"Concern", agree:"Agreement" };

  // Remark text is written by anyone holding the link. It is inserted as text
  // nodes only, never as markup, so a remark cannot script the page for the
  // next reader.
  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function when(iso){
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("en-IN", { day:"numeric", month:"short", hour:"numeric", minute:"2-digit" });
  }
  function render(list){
    if (!list || !list.length){
      thread.innerHTML = '<p class="empty">No remarks yet. Be the first.</p>';
      return;
    }
    thread.innerHTML = list.map(function(r){
      var who = esc(r.author || "Anonymous");
      var top = r.topic ? ' · <span class="when">' + esc(r.topic) + "</span>" : "";
      return '<div class="note">' +
        '<span class="who">' + who + '</span> ' +
        '<span class="tag t-r2">' + esc(LABEL[r.kind] || r.kind) + "</span>" + top +
        ' <span class="when">' + esc(when(r.created_at)) + "</span>" +
        "<p>" + esc(r.body) + "</p></div>";
    }).join("");
  }
  function load(){
    fetch(ENDPOINT, { headers: { accept: "application/json" } })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){ render(d.remarks); })
      .catch(function(){ thread.innerHTML = '<p class="empty">Could not load remarks.</p>'; });
  }
  load();

  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    var body = document.getElementById("rm-body").value.trim();
    if (body.length < 3){
      say.className = "say bad";
      say.textContent = "Write a little more than that.";
      return;
    }
    btn.disabled = true;
    say.className = "say";
    say.textContent = "Posting…";
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        author: document.getElementById("rm-author").value.trim(),
        kind:   document.getElementById("rm-kind").value,
        topic:  document.getElementById("rm-topic").value.trim(),
        body:   body
      })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, d: d }; });
    }).then(function(res){
      if (!res.ok) throw new Error(res.d && res.d.error ? res.d.error : "Could not post that.");
      document.getElementById("rm-body").value = "";
      document.getElementById("rm-topic").value = "";
      say.className = "say ok";
      say.textContent = "Posted. Thank you.";
      load();
    }).catch(function(err){
      say.className = "say bad";
      say.textContent = err.message || "Could not post that.";
    }).then(function(){
      btn.disabled = false;
    });
  });
})();
</script>
`
    .replace(/__BASE__/g, base)
    .replace(/__DOC__/g, doc);
}
