# Home as an action console — build + verification report

**Date:** 2026-07-28 · **Scope:** `apps/mobile` Home & Profile, `/api/home`, `@influnet/core`
**Status:** shipped on `dev`, verified by test (not yet on a live device with real data)

---

## 1. The problem

Mobile Home and Profile called the **same** endpoint (`/api/home`) and rendered
nearly the same blocks. Home showed the creator's recent post grid, latest
YouTube videos, audience split, reach-per-post chart and brand ratings — all five
are *identity* content, all five already existed on Profile, and none of them
answer the only question Home exists to answer: **what do I need to do next?**

Home was a second copy of the public profile with two numbers on top.

Meanwhile the data that makes Home useful was already in the codebase and unused:

| Already existed | Where | Used by Home before? |
|---|---|---|
| `STAGE_ACTOR` — which side moves each of the 12 stages | `packages/core/src/project-lifecycle.ts` | No |
| `STAGE_GUIDE` — the concrete per-side actions per stage | `packages/core/src/project-stage-guide.ts` | No |
| `stage_progress` sign-offs per side | `campaign_projects.stage_progress` (migration 081) | No |
| `unread_messages_count` | already polled by `lib/notification-summary.ts` | No |

So "whose move is it" was derivable the whole time. Home simply never asked.

---

## 2. What shipped

### `projectTurn()` — the new primitive
`packages/core/src/project-turn.ts`. Pure, no DB, no platform APIs, so the API
layer, mobile and (later) the web dashboard all reach the *same* verdict instead
of each inventing one.

```ts
projectTurn({ stage, side, stageProgress }) → { turn: 'you' | 'them' | 'none', action: string }
```

The resolution order, and why each rule exists:

1. **Both sides signed the current stage** → `you`, *"Open the project to continue"*.
   See §4 — this is the deadlock case.
2. **You signed, they haven't** → `them`. `STAGE_ACTOR` alone cannot do this: it
   names the side that pushes a stage forward, so it keeps saying *your turn*
   after you have already confirmed.
3. **They signed, you haven't** → `you`, regardless of who does the substantive
   work. They are done and waiting on you.
4. **Neither signed** → `STAGE_ACTOR` decides. Both sides *may* sign a bilateral
   stage, but calling it "your move" for both is how the screen ends up
   headlining **"Your move — Wait for the first draft"** (see §4).
5. **Non-sign-off stages** (`sent_for_review`, `final_payment`,
   `project_completed`) → `STAGE_ACTOR` is the authority; they keep their own
   dedicated controls.

### `/api/home`
Now selects `stage_progress` and returns per active project: `my_side`, `turn`,
`next_action`, plus `counts.your_turn`. Computed server-side because
`stage_progress` is far too heavy to ship to a phone for every project. **Purely
additive** — the web dashboard reads the same endpoint and is unaffected.

### Home (`apps/mobile/app/(tabs)/home.tsx`)
Reads top-down as *what's waiting on me → which projects need my move → who I'm
waiting on → what the money is doing*:

1. **Pipeline value / committed spend** (headline)
2. **Needs you** — proposals, collaboration requests, unread messages *(new)*, verification nudge
3. **Your move** — one card per project, headlined by the concrete next step
4. **Waiting on others** — the rest, showing what the other side owes
5. **Earnings / spend · last 6 weeks**, **Pipeline** donut, **At a glance**

Removed: post grid, video list, audience breakdown, reach-per-post, brand
ratings, and the "Current focus" / "In flight" pair the two turn sections replace.

### Profile (`apps/mobile/app/(tabs)/profile.tsx`)
Gains the **audience breakdown** and the **reach-per-post** chart (inside the
Recent posts card), joining the posts, videos, ratings and brand wall already
there. Profile is now the single answer to *"how do I look to a brand?"*.

---

## 3. The creator's journey, stage by stage

Generated from the shipped code, not written by hand. This is exactly what each
side sees on Home at each point of a project with no sign-offs recorded yet.

| Stage | Advances by | Creator sees on Home | Brand sees on Home |
|---|---|---|---|
| Collaboration Started | both sign off | **Your move** — Say hello and confirm the fit | **Your move** — Introduce your brand and the campaign |
| Discussion | both sign off | **Your move** — Send your quote and confirm the deliverables | **Your move** — Agree deliverables, timeline and budget |
| Advance Payment | both sign off | Waiting | **Your move** — Pay the advance to start the work |
| Content Planning | both sign off | **Your move** — Share the concept or script | Waiting |
| Content Confirmation | both sign off | Waiting | **Your move** — Approve the concept, or request changes |
| Shooting in Progress | both sign off | **Your move** — Shoot the content | Waiting |
| Editing in Progress | both sign off | **Your move** — Finish the edit and submit the draft | Waiting |
| Sent for Review | single actor | Waiting | **Your move** — Review the draft: approve or request revisions |
| Revisions | both sign off | **Your move** — Apply the notes and resubmit | Waiting |
| Final Approval | both sign off | Waiting | **Your move** — Give the final green light |
| Final Payment | single actor | Waiting | **Your move** — Release the final payment |
| Completed | terminal | — | — |

The first two stages are deliberately actionable for **both** sides
(`STAGE_ACTOR` = `either`): introductions and terms are a conversation, not a
hand-off. From Advance Payment onward the turn ping-pongs cleanly — at any moment
exactly one side is holding the project.

**Once a side signs off**, its row flips to *Waiting* and the other side's row
becomes actionable, independent of the table above. That is rule 2/3 in §2.

---

## 4. Two defects found *during* verification

Both were found by testing the full stage × sign-off matrix rather than the
happy path. Both would have shipped otherwise.

### 4a. Deadlock: a project frozen on two Home screens

**Symptom:** with both sign-offs recorded on a stage that had not advanced, every
combination reported `them` to *both* sides. Neither user would see the project
in "Your move"; nothing anywhere prompted anyone to open it.

**Was it reachable?** Yes. Through `/api/projects/[id]` the second sign-off
advances the stage in the same request, so the state is transient there. But
**migration 081 deliberately permits a participant to PATCH their *own* sign-off
straight through PostgREST**, and that write runs no advance logic. Two sign-offs
land, the stage never moves.

**Fix:** both-signed is now reported as actionable to both sides
(*"Open the project to continue"*). Honest, and self-healing — opening the
project and confirming re-enters the API path, which sees both sign-offs and
advances the stage.

### 4b. "Your move — Wait for the first draft"

**Symptom:** because both sides *can* sign a bilateral stage, three stages
produced an actionable card headlined with a passive instruction — a card that
says *Your move* and then tells you to wait.

**Fix:** rule 4 in §2 — when neither side has signed, `STAGE_ACTOR` decides who
is genuinely holding the stage. The four passive strings were also rewritten as
confirmations (*"Confirm the draft once it arrives"*), so they read correctly in
the one path that does surface them (rule 3: the other side signed first).

A regression test now asserts **no `turn: 'you'` may ever carry an action
starting with "Wait"**.

---

## 5. Verification performed

| Check | Result |
|---|---|
| `apps/web/tests/unit/project-turn.test.ts` — 11 tests incl. full deadlock sweep (48 stage/sign-off combinations) | ✅ pass |
| Full web unit suite (`vitest run tests/unit/`) — 15 files | ✅ 175 pass |
| `tsc --noEmit` — `apps/web` | ✅ clean |
| `tsc --noEmit` — `apps/mobile` | ✅ clean |
| `expo export --platform ios --platform android` | ✅ both bundles built (8.1 MB / 8.4 MB) |
| Stage table in §3 regenerated from shipped code | ✅ matches |

**Not verified:** rendering against a live account with real projects. There is no
logged-in session in this environment, so the turn rows are proven by assertion
rather than by observation on a device. Worth one pass through a real project
before this is called done.

---

## 6. Best practices this establishes

1. **Derive state, never duplicate it.** `projectTurn()` reads the existing
   lifecycle constants and `stage_progress`. No new column, no new table, no
   second source of truth to drift. Compare the activity feed, which is derived
   through `get_user_activity` rather than kept as an event log.
2. **Decide in `@influnet/core`, render in the app.** Anything web and mobile
   must agree on belongs in the shared package. Two implementations of "whose
   move is it" would eventually disagree, and users would see a project that is
   their turn on one surface and not on the other.
3. **Compute heavy verdicts server-side.** `stage_progress` never crosses the
   wire to the phone; a three-field verdict does.
4. **Test the matrix, not the happy path.** Both defects in §4 came from
   enumerating every stage × sign-off combination. The happy-path unit tests
   (10 of them, all passing) missed both.
5. **A screen has one job.** Home = what to do. Profile = how you look. The
   moment the same block appears on both, one of them is wrong.
6. **Fail toward visible.** An unrecognised stage resolves to *actionable*, not
   hidden — a stage from a newer backend must never silently drop a live project
   off Home.

---

## 7. Round two — portfolio and analytics (shipped 2026-07-29)

### 7a. The creator portfolio

`past_collaborations` was a flat array of brand-name strings rendered as chips,
and `influencer_profiles.portfolio` (migration 012) was a JSONB column read by
the public RPCs, written by no UI and rendered by nothing — a dead column. Both
are replaced by **migration 087**, `creator_portfolio_items`.

A creator adds past work by pasting the link to the actual post. Everything
derivable from that link is derived server-side:

| Platform | Thumbnail | Title |
|---|---|---|
| YouTube | `img.youtube.com/vi/<id>/hqdefault.jpg` — a predictable path, so **no network call and it cannot fail** | pulled from YouTube's public oEmbed; a failure costs the suggested title, never the entry |
| Instagram | none — oEmbed needs a Facebook app token and scraping from a datacenter IP hits a login wall. The UI draws a branded tile rather than shipping a fetch that works on a laptop and fails in production | creator supplies |
| Anything else | none — stored as a plain link, never fetched | creator supplies |

**The trust rule.** Entries have two provenances and must never look alike:

- `platform` — a completed `campaign_project`. **Derived live by the RPC, never
  stored**, so a cancelled project stops advertising itself immediately and the
  brand name cannot drift from the project record.
- `manual` — the creator typed it in. We validated the URL's host and nothing else.

`verified` is therefore not a column anybody can write: the RPC computes it from
the source, and `getCreatorPortfolio()` **re-derives it again on read** rather
than trusting the payload. That second check is deliberate belt-and-braces — the
flag is one careless edit away from being selected off a creator-writable
column, which is precisely the hole migration 083 closed for the profile badge.
The UI distinguishes them by border, label *and* icon, never colour alone.

Surfaces: mobile Profile (`PortfolioGrid`), the add screen
(`app/portfolio/add.tsx`), and the public `/c/[username]` page.

### 7b. Home analytics

Home showed a headline figure and project rows; it now answers "how is it
actually going?". All of it is derived in `/api/home` from rows that endpoint
**already fetched** — Home is the first screen after launch and its budget is
one round trip.

| Section | What it answers | Why this shape |
|---|---|---|
| **Going quiet** | which projects have had no movement in 7+ days, worst first | invisible everywhere else — a stalled project looks perfectly healthy sitting in its stage |
| **This month** | money delivered, vs last month | an absolute figure says nothing about direction; the delta is the point |
| **Where your work is sitting** | active projects across Setup / Production / Review / Payment | four phases, not twelve stages — twelve bars on a phone is noise, and the question is which part is backed up |
| **Requests to delivered** | received → accepted → delivered, with both rates | the funnel a creator is actually judged on |

Two deliberate refusals to fabricate insight: a month-over-month delta against a
zero baseline is `null` (shown as a plain figure, not "up ∞%"), and a conversion
rate with a zero denominator is hidden rather than rendered as `0%` — "0%
delivered" with nothing accepted yet reads as failure where the truth is "not
applicable".

### 7c. A security bug found while testing

`resolvePortfolioLink()` accepts a user-supplied URL and runs on the server —
the classic SSRF setup. The defence is that **we construct every outbound URL**:
input is reduced to an opaque ID, matched against a strict character class, and
interpolated into a hard-coded host, so no fetch ever targets a pasted string.

Writing the SSRF tests caught a real hole in the first version. The scheme check
ran *after* a `https://` prefix was added to protocol-less input, so
`file:///etc/passwd` became `https://file///etc/passwd` — which parses cleanly
with hostname `file` and sailed straight past the check that existed to stop it.
It would then have been stored and rendered as a tappable link. Fixed by
detecting the scheme *before* prepending anything.

### 7d. Verification (round two)

| Check | Result |
|---|---|
| `portfolio-link.test.ts` — 15 tests incl. metadata endpoints, private ranges, decimal-encoded IPs, lookalike hosts, non-http schemes | ✅ pass |
| `portfolio-view.test.ts` — 9 tests incl. "manual can never be verified" and unapplied-migration degradation | ✅ pass |
| Full web unit suite | ✅ 201 pass (17 files) |
| `tsc --noEmit` web + mobile | ✅ clean |
| `expo export` iOS + Android | ✅ both bundle |
| Migration 087 parsed with Postgres's own grammar (`libpg-query`), incl. the RPC body | ✅ 21 statements |
| `/c/[username]` compiles and serves | ✅ (404 path — see gap below) |

**Not verified.** Migration 087 is unapplied on the hosted database, so nothing
here has run against real data: no portfolio has been added end-to-end, and the
grid has not been seen rendering on a device. Docker was unavailable locally, so
the SQL is syntax-checked rather than executed — column references and the
UNION's type unification are unproven. Apply 087 and add one YouTube link as the
first real test.

---

## Files touched

| File | Change |
|---|---|
| `packages/core/src/project-turn.ts` | **New.** `projectTurn()` + per-stage/per-side action text |
| `packages/core/src/index.ts` | Export the new module |
| `apps/web/src/app/api/home/route.ts` | Select `stage_progress`; return `my_side` / `turn` / `next_action` / `counts.your_turn` |
| `apps/mobile/app/(tabs)/home.tsx` | Rebuilt as the action console |
| `apps/mobile/app/(tabs)/profile.tsx` | Received the audience breakdown + reach-per-post chart |
| `apps/web/tests/unit/project-turn.test.ts` | **New.** 11 tests incl. the deadlock sweep |
| `supabase/migrations/087_creator_portfolio.sql` | **New.** Portfolio table, RLS, 24-item cap, `get_creator_portfolio` RPC |
| `apps/web/src/lib/portfolio-link.ts` | **New.** Link → platform/thumbnail/title, with the SSRF guard |
| `apps/web/src/app/api/portfolio/route.ts` | **New.** GET / POST / DELETE |
| `apps/web/src/lib/public-profile/get-portfolio.ts` | **New.** Public read, re-derives `verified` |
| `apps/mobile/components/portfolio-grid.tsx` | **New.** The card grid |
| `apps/mobile/app/portfolio/add.tsx` | **New.** Add past work |
| `apps/web/src/components/public-profile/creator-profile-view.tsx` (+ CSS) | Portfolio section on `/c/[username]` |
| `packages/core/src/project-lifecycle.ts` | `STAGE_PHASE` / `phaseOf()` for the phase chart |
| `apps/web/tests/unit/portfolio-{link,view}.test.ts` | **New.** 24 tests |
