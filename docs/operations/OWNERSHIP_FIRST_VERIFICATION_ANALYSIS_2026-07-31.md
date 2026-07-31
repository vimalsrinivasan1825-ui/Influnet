# Ownership-first verification — how it works today vs. the proposed model

**Date:** 2026-07-31
**Branch:** `dev` @ `53cbfa0b`
**Scope:** analysis only. No code changed.
**Companion doc:** `AUTH_AND_VERIFICATION_PARITY_2026-07-31.md` (the mobile P0 bugs)

> **Note:** the images referenced in the request did not arrive — this analysis is
> from source only. If they showed specific screens, worth re-sending.

---

## 1. Your read of the system is correct — confirmed in code

> "Right now, if I put any Instagram/LinkedIn ID, I can scrape the data and
> create a public profile. The only thing is, I don't put my public profile URL
> in the bio, so I can't get verified."

Exactly right, and it's worse than "can't get verified" — **nothing else is
gated at all.** Ownership proof is consumed in precisely **one** place in the
entire codebase:

`apps/web/src/lib/verification.ts:133`
```ts
if (role === 'influencer' && !signals.ownership_verified) {
  return { score, status: 'in_review', reason: 'Metrics look strong, but account ownership is not yet confirmed — pending review.' };
}
```

A repo-wide grep for `ownership_verified` / `social_account_claims` outside the
verification route returns nothing else. So today, ownership affects **only**
whether a ≥0.85-scoring creator auto-approves or goes to a human queue.

### What is NOT gated on ownership (all confirmed)

| Thing | Gated? | Evidence |
|---|---|---|
| Scraping a handle at signup | **No** — unauthenticated route | `api/auth/scrape-instagram/route.ts` — anonymous, IP rate-limited to 5/min, no account needed |
| Capturing the snapshot (followers, posts, thumbnails) | **No** | `api/verification/route.ts:110-112` — runs on the auto-fired signup verification |
| Public profile going live at `/c/username` | **No** | `get_public_influencer` (083) filters on `role = 'influencer'` only |
| Appearing in Discover / search | **No** | `search_influencers` (084) `WHERE p.role = 'influencer' AND ip.user_id <> auth.uid()` — no verification predicate |
| Refreshing the numbers | **No** | `api/profile/refresh/route.ts` — reads the handle off `influencer_profiles`, no claim check |
| Receiving collab requests / messaging | **No** | no verification predicate in the collab routes |
| Getting the badge | **Partially** | ownership gates *auto*-approval only; an admin can still approve manually, and scores 0.5–0.85 land in `in_review` regardless |

Worth noting: `ownership_verified` contributes **zero points** to
`scoreCreatorSignals()`. It is a pure gate at the top band, not a scored signal.
So the ranking of an unverified impersonator is identical to a real creator's.

**Net:** sign up with any handle → the snapshot is captured automatically →
`/c/<username>` is live and indexed with someone else's real follower counts and
post thumbnails, within seconds, with zero proof. That's the hole you identified.

---

## 2. The critical finding: the web app already teaches your model — but the engine doesn't implement it

This is the most important thing in this report.

The **most prominent verification UI on the creator dashboard** —
`VerificationGuide`, mounted on creator home at
`app/dashboard/home/page.tsx:288-293` — tells creators to do *precisely* what you
described:

`components/dashboard/verification-guide.tsx:106-112` (step 1)
> **"Copy your public profile link"** → renders `${origin}${publicPath}` i.e.
> `https://influnet.in/c/priyasharma` with a Copy button

`:137-143` (step 2)
> **"Paste it in your Instagram bio"** — "paste the link into the Website or Bio
> field. Keep your account public so we can find it."

`:157-160` (step 3)
> "Head to Settings → Verification and click **Verify I own my handle**. The
> badge shows up right after."

**But the server does not look for the public profile link.** It looks for a
one-time code:

`api/verification/ownership/route.ts:19-25, 131`
```ts
function newCode() { return `vf_${randomBytes(18).toString('base64url')}`; }
function verifyUrl(code) { return `${publicOrigin()}/vf/${code}`; }
...
found = bio.includes(claim.code);   // matches vf_xxx — NOT /c/<username>
```

### What actually happens to a creator who follows the guide exactly

1. Copies `influnet.in/c/priyasharma`, pastes it in their IG bio. ✅ (real effort spent)
2. Goes to Settings → clicks "Verify I own @priyasharma".
3. That fires `action: 'initiate'`, which mints a **different** link
   (`influnet.in/vf/vf_A7x…`) and swaps the panel into its pending state
   (`instagram-ownership-panel.tsx:43-61`).
4. Confused, they click **"I've added it — Verify"**.
5. The scrape searches the bio for `vf_A7x…`, doesn't find it, and returns:
   *"We couldn't find your code in the bio yet."*

They did everything the guide asked and it failed. There is a 30-minute TTL and
a 12-attempt cap (`route.ts:11-13`) burning down while they work this out, and
each confirm attempt spends a paid Apify scrape.

**So the "insistence" problem you're describing is compounded by the fact that
the loudest instruction in the product points at a mechanism that doesn't
exist.** The guide and the engine were built to two different designs and never
reconciled.

Also note: the guide hides itself on `!data.profile.verified` — that's the
**badge**, not the ownership claim. An admin-approved creator with no ownership
proof never sees it.

---

## 3. Inventory: every place the product currently asks for verification

### Web — 3 surfaces

| # | Surface | Where | Shows when | Hides when |
|---|---|---|---|---|
| W1 | `VerificationGuide` (3-step card) | Creator home, `home/page.tsx:288` | `isCreator && !profile.verified` | **7-day snooze** via `localStorage` `influnet_verification_guide_dismissed_at` (`verification-guide.tsx:29-30, 45-51`) |
| W2 | `VerifyOwnershipNudge` (one-line banner) | Creator home, `influencer-home.tsx:45` | creator + has IG handle + claim ≠ `verified` | `welcomeOpen` is true; **7-day snooze** via `localStorage` + `POST /api/profile/ownership-nudge` (migration 085) |
| W3 | `InstagramOwnershipPanel` | Settings, `settings/page.tsx:378-380` | `isInfluencer && profile.instagram_handle` | never — but you must navigate to Settings to see it |

W2 is the only surface anywhere that reads the **actual claim status**. W1 and
the mobile nudges all key off the badge instead.

### Mobile — 2 surfaces, both creator-only

| # | Surface | Where | Shows when | Hides when |
|---|---|---|---|---|
| M1 | Home action-console card | `(tabs)/home.tsx:243-251` | `isCreator && !home.profile.verified` | never (no snooze) — but sits in a list below pending requests and unread messages |
| M2 | Profile "Get verified" card + Manage row | `(tabs)/profile.tsx:641-658`, `:691-698` | `isCreator` | never |
| — | Settings | `app/settings.tsx` | **no verification entry at all** | — |

### Why none of this reads as "insistent"

1. **Both web surfaces are dismissible on a 7-day snooze.** A creator clicks the
   X twice in a fortnight and the product effectively stops asking.
2. **Everything is keyed off `verified` (the badge), not the ownership claim.**
   Someone whose badge came from admin review, or who is stuck in `in_review`,
   sees nothing.
3. **Zero consequence for ignoring it.** Per §1, the public profile is live, the
   numbers are populated, and they're in search results. The nudge asks for
   effort in exchange for a badge that isn't blocking anything they want.
4. **Mobile's nudges are non-actionable anyway** — tapping through leads to a
   screen where "Get my code" returns `A handle is required` (see the companion
   doc, P0-1). So mobile's *only* two prompts currently lead to a dead end.
5. **Business accounts are never asked** on either platform for ownership
   (web shows them the metrics panel only; mobile shows them nothing).

---

## 4. Your proposed model vs. what exists

> "Initially give the link and ask them to verify it. They copy the public
> profile link, put it in their bio, we scrape and see the link is there — now we
> know 100% this is their ID. **After that** we process the scraping and create
> the public profile."

Two distinct changes are bundled here. Separating them matters, because one is
mostly built and the other is not built at all.

### Change A — sequencing: verify **before** scrape/publish

This is the substantive change and **none of it exists today.** Currently the
order is: scrape at signup (anonymous) → account created → snapshot captured
automatically → profile live → *then*, maybe, verification.

Your model inverts it: account created → prove ownership → *then* scrape,
snapshot, publish.

Touchpoints that would each need a claim check (none have one now):

| Touchpoint | File | Change needed |
|---|---|---|
| Signup autofill scrape | `api/auth/scrape-instagram/route.ts` | Decide whether prefill-before-signup survives at all — it's anonymous by design |
| Auto-verification at signup | `use-signup.ts:111`, `signup/influencer/page.tsx:280` | Stop firing the pipeline until ownership lands |
| Snapshot capture | `api/verification/route.ts:110-112` | Gate on a verified claim |
| Manual refresh | `api/profile/refresh/route.ts` | Gate on a verified claim |
| Public profile | `get_public_influencer` RPC | Return null / a "pending" shell until verified |
| Discovery | `search_influencers` RPC | Exclude, or clearly segregate, unverified profiles |

Note the tension to resolve first: web's signup **step 1 is Instagram autofill**
(`signup/influencer/page.tsx:142-174`) — scraping is currently how the wizard
gets pleasant, and it happens before an account exists. A verify-first world has
to decide whether that prefill stays (it's low-risk: 5 fields, no publishing) or
goes.

Also needs a decision: **what does a creator's `/c/<username>` show while
unverified?** Hard 404, or a real page with a "numbers not yet confirmed" state?
A 404 is cleaner for trust but means new signups have nothing to share on day
one, which is the main thing creators want at signup.

### Change B — mechanism: permanent profile link instead of one-time code

This one is **already the copy** (§2) but not the engine, and it is a decision
you've previously landed on the other side of — worth re-opening deliberately
rather than by accident.

| | One-time code `vf_xxx` (current engine) | Permanent link `/c/username` (current copy, your description) |
|---|---|---|
| Proof strength | "Whoever controls this bio requested this code in the last 30 min" | "This bio contains a string that is public and guessable" |
| Replay risk | None — single-use, expires | **Real.** If a creator legitimately keeps the link in bio and later deletes their account or frees the username, whoever claims that username next verifies instantly against the old bio |
| Social-engineering risk | Low — an opaque `vf_` token is obviously a one-off | Higher — "add our link to your bio" is a normal marketing ask; a creator can be talked into placing it |
| Creator friction | Must paste, verify, then remove | Paste once, keep it (they often want to anyway) |
| Enables re-checking later | No | **Yes** — you can periodically re-scrape and confirm the link is still there, which is a genuinely stronger ongoing signal |
| Bio real-estate cost | Temporary | Permanent — competes with Linktree etc., which is why creators push back |

There's a **hybrid** worth considering that keeps both properties: verify with
the one-time code (strong, unforgeable, what's already built), then *invite* —
not require — the creator to keep the permanent `/c/username` link in bio as a
marketing/"re-confirmation" thing. That way the security event stays
unreplayable, and you still get the periodic re-check signal from creators who
opt in.

---

## 5. What "insisting every time" would actually require

Not a redesign — mostly removing the escape hatches and adding consequence:

1. **Reconcile guide and engine** (§2). Whichever mechanism you pick, one of the
   two has to change. This is the single highest-value fix here and it's small.
2. **Key every nudge off claim status, not the badge.** `VerifyOwnershipNudge`
   already does it correctly (`verify-ownership-nudge.tsx:62-70`) — the pattern
   exists to copy.
3. **Downgrade snooze to something weaker** — or make it re-arm on a shorter
   cycle. Currently 7 days, and W1's is `localStorage`-only, so it's per-device.
4. **Fix mobile's P0s first.** Making mobile more insistent before the flow works
   would just drive people harder into a `A handle is required` error. Sequencing
   matters: companion doc Ship 1, then this.
5. **Add mobile Settings + business entry points** (currently absent).
6. **Add the consequence.** This is Change A and it's the only thing that makes
   nudging unnecessary — if the public profile and search listing don't exist
   until verified, the creator's own motivation replaces the nagging. Everything
   above is a workaround for the absence of this.

---

## 6. Open questions before any of this is built

1. **Mechanism:** one-time code, permanent profile link, or the hybrid in §4?
   This decides whether the guide changes or the engine does.
2. **Unverified public profile:** 404, or a live page in a "numbers unconfirmed"
   state?
3. **Signup autofill:** keep the anonymous prefill scrape, or drop it in a
   verify-first world?
4. **Existing creators:** everyone already on the platform has an unverified,
   fully-live public profile. Grandfather them, or run a migration window with
   notifications and a deadline?
5. **LinkedIn** (you mentioned it): the ownership route currently hard-refuses
   anything but Instagram — `CONFIRMABLE_PLATFORMS = new Set(['instagram'])`
   (`route.ts:17`). The `social_account_claims` schema is platform-ready, but
   there is no LinkedIn scraper. Separate build.
