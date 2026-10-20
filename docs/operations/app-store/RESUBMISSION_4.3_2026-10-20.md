# iOS resubmission pack — Guideline 4.3 / 4.2.6 rejection (build 1.0.0 (9), 20 Oct 2026)

Apple's message: "Guidelines 4.3 – Spam and 4.2.6 – App Generation Services".
It is a template message: it lists every spam pattern and asks 9 questions.
It does not say which one applies. So the job is (1) remove anything that
makes Influnet *look* like a template/copy, (2) answer the 9 questions with
facts, (3) reply in Resolution Center. **Do not press "Resubmit" first** —
Apple says to reply instead if you believe the app complies.

Apple's own wording (App Review Guidelines, fetched 2026-10-20):
- 4.3(b): rejects apps "indistinguishable from what's already widely available".
- 4.2.6: rejects apps from a template/generator "unless they are submitted directly by the provider of the app's content".
- 4.2: the app must go "beyond a repackaged website".

## 1. What we found in the audit

| Area | Finding | State |
|---|---|---|
| 4.2.6 operator unclear | Legal pages never said who runs Influnet; seller is "Tecstellar Solutions LLP" | **Fixed in code** (not yet deployed): Terms §1, Privacy §1, Contact page now say Influnet is owned and operated by Tecstellar Solutions LLP |
| 4.3(b) generic positioning | Review notes opened "a marketplace where brands hire content creators"; subtitle "Brand deals for creators" | **Rewrite below** (metadata only, no build) |
| Contact (1.5) | `support@` / `grievance@influnet.io` have no MX record, so they bounce; the public site shows no contact address | Contact page now also lists `influnet@tecstellar.com`. **Owner: set up the MX** (item A) |
| 3.1.1 In-app purchase | Pro purchase hidden on store builds (`EXPO_PUBLIC_HIDE_PRO_PURCHASE=1` in the `production` profile); every upsell checked | OK |
| 4.8 Sign in with Apple | No social login, email + password only | OK |
| 5.1.1(v) Account deletion | In Settings | OK |
| 1.2 User content | Report + block on profile, chat, request, campaign, project | OK |
| 2.1 Demo account | `influnet+review-creator@tecstellar.com` has a pending request | OK, **re-check it still works** (item C) |
| 4.2 "repackaged website" | Creator public profile is a WebView of `/<username>?app=1` (`components/profile-web-view.tsx`). Everything else is native. | Say so in the reply; no change needed |
| Screenshots | First screenshot is Home (generic) | Reorder (section 3) |

## 2. Metadata to change in App Store Connect (no new build)

**Subtitle (30):** `Brand deals, signed and paid` (28)

**Promotional text:**
> Run a brand collaboration end to end: both sides sign off each stage, and payment steps open only when the money is confirmed.

**Description, first paragraph** (keep the rest of `play-store/LISTING.md`):
> Influnet turns a brand–creator deal into a project with rules. Instead of agreeing in DMs and hoping, both sides sign off every stage — brief, drafts, review, revisions, approval, posting — and the advance and final payment steps open only when Razorpay confirms the payment. Built for Indian creators and the brands that hire them. Influnet is operated by Tecstellar Solutions LLP.

**App Review notes** (replace the current ones):
> Influnet is a deal-management app, not a discovery directory. Its core is a 12-stage project pipeline between one brand and one creator: most stages close only when BOTH sides sign off, a server-side checklist gates each step, and the advance/final payment steps open only after Razorpay confirms a captured payment. Creators prove they own their Instagram by putting their Influnet link in their own bio, and their public profile shows verified audience data.
>
> Demo account: a creator. A brand request is waiting in Requests. Accept it, then open Projects → a project to see the stage pipeline and sign-off. Messages and Projects are on the bottom bar; Profile is the avatar top-right. No SMS code is needed to log in.
>
> Influnet is our own product (Tecstellar Solutions LLP owns the brand, content and service). It is not built from a template or app-generation service. Payments are brands paying creators for real-world content production, via Razorpay on our website (Guideline 3.1.3(e)); the app sells no subscriptions or digital content on iOS. Users can report or block anyone, and delete their account in Settings.

**Screenshot order:** 4-project-detail, 3-projects, 2-requests, 5-messages, 1-home, 6-profile.
The first image must show the stage pipeline / sign-off, because that is what no other app does.

## 3. Reply to Apple (Resolution Center → Reply)

Use the draft from the chat. Fill the `[…]` items with true facts only:
- **Q4 beta testing:** we have real evidence. A 206-step two-phone QA checklist
  (`docs/operations/module-map.html` / the `/r/<token>/test-run` page), Play
  open testing on vc 8, and builds 7–9 on TestFlight. Give the number of
  testers and dates yourself; do not guess them. Feedback → fix examples that are
  in git history: keyboard covering inputs (app-wide avoider), launch hang
  ("Getting things ready"), Android 13 notification permission, mobile
  dead-end at the "sent for review" stage.
- **Q5–Q7:** open App Store Connect → Apps and list every app on the account. If Influnet
  is the only one, say so.
- **Q9:** say Tecstellar Solutions LLP owns Influnet. Only write this if it is true.

## 4. Owner-only items

| # | Item |
|---|---|
| A | Add MX / Cloudflare Email Routing for `influnet.io` so `support@` and `grievance@` work, or tell me to switch every page to `influnet@tecstellar.com` |
| B | Deploy this change: landing (`apps/landing`) and web (`apps/web`) must go live so `influnet.io/terms` and `/privacy` show the operator line. Apple opens those URLs. Push to `dev`, merge `dev → staging`, confirm on the live pages |
| C | Log in once on a phone as the review creator and confirm the request is still in Requests |
| D | Change Support URL to a page that shows an email, e.g. `https://staging.influnet.io/legal/contact` (works today), or `influnet.io` once it lists one |
| E | Confirm that Tecstellar Solutions LLP owns Influnet (decides Q9, and whether 4.2.6 can apply at all) |
| F | If Apple replies that more changes are needed, the next step is the App Review Board appeal, not a new binary |

## 5. Do not do

- Do not resubmit before replying.
- Do not push mobile code to `staging` while iOS is in review: it publishes an OTA to all installed builds including the live Play app.
- Do not write an invented beta story. Apple compares answers with the build.
