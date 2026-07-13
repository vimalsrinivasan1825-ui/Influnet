# Onboarding & Public Profile — Product Lineup

> Living spec / backlog. We design here first, then build. Check items off as they ship.
> Related: [[verification research artifact]] (API options), `docs/product/PROJECTS_AND_VERIFICATION.md`, `docs/product/ROADMAP.md`.

## 1. The goal in one line

Turn signup into a *reason to join*: a creator finishes onboarding and instantly has a **beautiful, verified public profile** ("media kit / link-in-bio banner") they paste into their Instagram/YouTube bio to send fans back to Influnet — and every number on it is **real**, because we only show what they've **authenticated**.

Two north stars:
- **Onboarding = the product's first impression.** It must feel promising, fast, and worth the effort.
- **Trust is the moat.** No metric appears anywhere unless its source account was verified. This is the 80/20: most creators *will* connect if connecting is what unlocks the good profile.

---

## 2. Current state (what exists today)

| Area | Today | File |
|---|---|---|
| Creator signup | 4 steps: Account → Profile → Positioning → Collab/pricing. **Social handles are free text, unverified.** | `apps/web/src/app/signup/influencer/page.tsx` |
| Business signup | 4 steps: Account → Company → Verification/address (GST optional) → Intent. **GST/website unverified.** | `apps/web/src/app/signup/business/page.tsx` |
| Public profile | `/influnet/[slug]` is a redirect stub → `/c/[username]`. Canonical page exists but is thin. | `apps/web/src/app/influnet/[slug]/page.tsx`, `/c/[username]`, `/b/[username]` |
| Verification | Format-only heuristic (regex), no real source checks. | `src/lib/verification*.ts` |

### Gap analysis — the "missing professional things"

- [ ] **Social IDs are unverified** — anyone can type any handle / follower claim. (biggest problem)
- [ ] **No email verification / phone OTP** at signup (OTP not wired).
- [ ] **No live preview** of the public profile *while* onboarding (Linktree/Beacons show the page building — huge motivator).
- [ ] **No profile-strength / completion meter** (LinkedIn-style nudge to finish).
- [ ] **No "save & resume"** — onboarding is all-or-nothing, no draft persistence.
- [ ] **No media kit / downloadable asset** for creators to share.
- [ ] **Public profile is a stub** — no real design, not editable, doesn't showcase connected platforms.
- [ ] **No creator-side verification tier** (business has an approval gate; creators have none).
- [ ] **No first-run empty states** guiding the first action after signup.
- [ ] **No signature shareable** unique to Influnet (a card / code fans recognize).

---

## 3. Core principle — "Connect to verify" (the fraud fix)

Every social account moves through **tiers**, and the public profile badge reflects the tier:

| Tier | How | What it unlocks | Badge |
|---|---|---|---|
| **Claimed** | Creator typed a handle | Nothing public — greyed "unverified" | — |
| **Connected** | Creator completed OAuth for that platform (proves ownership) | Real follower/subscriber counts, post list, top content shown publicly | ✔ Verified account |
| **Reviewed** | Admin approved (edge cases, business GST, disputes) | "Influnet Verified" gold badge | ★ Influnet Verified |

Rules:
- **A metric is never rendered — public or internal — unless its account is `Connected` or higher.** Typed handles are drafts, nothing more.
- Connecting is framed as the *unlock*, not a chore: "Connect Instagram to show your real stats and get verified."
- A `Connected` account is stronger proof than any scraped number: it proves the person controls the account.

### Data model (new)

```
social_connections
  id, user_id, platform ('instagram'|'youtube'|'tiktok'|'x'|'linkedin'),
  handle, external_id, status ('claimed'|'connected'|'reviewed'),
  connected_at, last_synced_at,
  followers, following, posts_count, engagement_rate,   -- snapshot, refreshed on sync
  raw jsonb,                                             -- last API payload
  token_ref                                              -- pointer to encrypted token store (never the raw token in this row)
```
- Public profile reads only `status IN ('connected','reviewed')` rows.
- A nightly/lazy `last_synced_at` refresh keeps numbers current (respect API quotas).

See the [[verification research artifact]] for which API powers each platform (YouTube Data API = free/now; Instagram Business Discovery + Instagram Login = free after Meta app review; Phyllo/InsightIQ or Modash/HypeAuditor when we scale).

---

## 4. Creator onboarding — redesigned flow

Design principles pulled from Linktree/Beacons/Stan (link-in-bio) and Fiverr/Upwork (marketplace):
- **Get them in fast, enrich progressively.** Don't gate account creation behind 4 dense screens.
- **Show the payoff early.** A live "profile preview" builds alongside their inputs.
- **Make connect the hero moment.** It verifies *and* fills half the profile automatically.

Proposed flow:

1. **Start** — email + password *or* "Continue with Google/Instagram" (social sign-in doubles as first verification). Pick username (with live availability + it becomes their `influnet.com/@username`).
2. **Connect your platforms** *(the new, central step)* — big buttons: Connect Instagram · YouTube · TikTok. Each OAuth pulls name, avatar, follower count, recent posts → auto-fills the profile. Skippable but heavily encouraged ("Verified creators get 3× more brand requests").
3. **Positioning** — niche(s), bio (pre-filled from their platform bio, editable), languages, location. Collab types + rate range.
4. **Preview & publish** — live public-profile preview; pick a theme; "Publish & copy your bio link."

Throughout: a **profile-strength meter** ("You're 70% to a verified profile — connect YouTube to reach 100%") and **auto-save drafts** so they can resume.

- [ ] Redesign creator signup as above
- [ ] Live preview component (reused on the public page)
- [ ] Profile-strength meter
- [ ] Draft persistence

---

## 5. Business onboarding — redesigned flow

Businesses need *legitimacy signals*, not follower counts. Keep it short; verify what matters.

1. **Start** — work email + password (or Google). Company name.
2. **Verify the business** — website (we run the free reachability check), GST number (format now; paid registry check later), optional company logo. Work-email domain match with the website raises trust.
3. **What you're looking for** — industry, budget range, creator niches/regions of interest.
4. **Done → matches** — land them straight on a "creators you might like" screen (the marketplace "aha"), while the account sits in the existing approval queue for anything unverified.

- [ ] Redesign business signup as above
- [ ] Wire website reachability check into onboarding
- [ ] Domain ↔ work-email match signal
- [ ] First-run "recommended creators" screen

---

## 6. Public profile — the editable "banner" / media kit

Lives at `/c/[username]` (the link-in-bio slug redirects here). Reference mood: a **modular, interactive, editable dashboard** (the shared image is *inspiration for the feel*, not a layout to copy — we do NOT replicate it).

Structure — **editable blocks** the creator can reorder / show / hide (Beacons-style):
- **Hero** — avatar, name, niche pills, location, verified badge, primary CTA ("Work with me" → collab request).
- **Connected-platform stat cards** — one per `Connected` platform: follower/subscriber count, engagement, growth sparkline. Real numbers only. Locked/greyed if not connected, with a "connect to show" nudge (owner-only view).
- **Featured content** — top posts/videos pulled from the connected accounts ("most-viewed reel/video").
- **About / rate card / collab types** — what brands need to decide.
- **Contact / socials row.**

Editing:
- Owner sees an **edit mode** (toggle blocks, reorder, pick a theme/accent, choose cm/in style units where relevant) — visitors see the published result.
- A few **theme presets** (not a blank canvas) so every profile looks pro out of the box.
- Everything is **responsive + theme-aware** and fast (it's the app's shop window).

### Locked design direction (concept v3)

- **Single screen, no scroll.** Identity/photo on the left; platform showcase on the right. People don't scroll a profile — show everything at once, like a press card.
- **Light mode by default**, with a dark toggle.
- **Full theming:** preset accents **+ a custom color picker** (any color). Owner-only controls live in a **lower toolbar** ("Edit public profile" + theme + color), never shown to visitors.
- **Platform cards replicate the real platforms:** the Instagram card reads like an IG profile (Posts · Followers · Avg views + a 3-tile grid of top posts); the YouTube card reads like a YT channel (Subscribers · Videos · Avg views + 3 video thumbnails with durations/views + Subscribe).
- **Keep:** total-reach headline + engagement. **Drop:** price/rate and star ratings.
- **Signature element:** the animated **"Influnet Verified Creator" seal** (rotating ring on the `i` mark + shimmer) — our own, not borrowed from any platform. Each platform card shows a "Connect-verified · refreshed" line as the trust payoff.

- [ ] Build `/c/[username]` public profile (single-screen, left identity + right platform cards)
- [ ] Owner toolbar: edit, light/dark, preset + custom accent color
- [ ] Live IG/YouTube cards from `social_connections` (real stats + top content)
- [ ] Animated Influnet Verified Creator seal

---

## 7. The signature shareable — "Influnet Code" + Verified Creator Card

A recognizable, ownable artifact (the Snapchat-Snapcode idea, made ours):

- **Influnet Code** — a branded scannable badge unique per creator that opens their profile. Distinct visual identity (not a generic black QR) so it becomes recognizable in bios/stories.
- **Verified Creator Card** — a beautiful, downloadable card (image for IG Stories + an interactive web version) showing avatar, name, niche, key verified stats, the verified badge, and the Influnet Code. One tap to share.
- Optionally a **vCard / digital business card** for DMs and email signatures.

- [ ] Influnet Code generator (branded)
- [ ] Verified Creator Card (downloadable image + web)

---

## 8. Build phases (lineup)

**Phase A — Trust foundation (unblocks everything)**
- [ ] `social_connections` table + encrypted token store
- [ ] YouTube OAuth connect (free, no approval) → first real `Connected` tier
- [ ] Verification tiers wired into profile rendering

**Phase B — Onboarding redesign**
- [ ] Creator flow (connect-first, live preview, strength meter, drafts)
- [ ] Business flow (verify-first, matches on completion)
- [ ] Email verification / phone OTP

**Phase C — Public profile**
- [ ] `/c/[username]` block system + edit mode + themes
- [ ] Live stat cards + featured content

**Phase D — Signature & polish**
- [ ] Influnet Code + Verified Creator Card
- [ ] Instagram (Business Discovery + Login) once Meta app review clears

---

## 9. Open decisions (need your call)

- [ ] **Which platform first?** Recommend **YouTube** (free, no approval) to prove the connect-to-verify loop end-to-end before the Meta review wait.
- [ ] **Connect: required or optional at signup?** Recommend *optional but gating* — you can finish signup, but stats/verified badge stay locked until you connect.
- [ ] **Banner direction** — you said you'll share more on how the banner should look. Drop your ideas and we'll lock the block layout + the Influnet Code visual here.
- [ ] **Provider vs direct** — start direct (YouTube/Meta APIs) now; revisit Phyllo/Modash at scale.
