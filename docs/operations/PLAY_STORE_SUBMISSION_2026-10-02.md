# Google Play submission — Influnet Android 1.0.0 (versionCode 7)

Date: 2026-10-02 · Package `com.influnet.app` · Build: EAS `4621c358`
(production profile → `staging.influnet.io` + Supabase `aokdansyqxracuwsosji`)

Answers below come from the code and the published privacy policy
(influnet.io/privacy, the same text the app opens at `/legal/privacy`), not
from memory. Where a question is a business decision it says so.

---

## 0. Before you press "Send for review"

| # | Step | Status |
|---|---|---|
| 1 | Merge PR #78 (`dev` → `staging`). Until then the app's Privacy/Terms links on `staging.influnet.io/legal/*` still show the **draft with placeholders** — a reviewer will open them. | ❌ you |
| 2 | Staging deploy green after the merge (migration 194 + web). Check `https://staging.influnet.io/legal/privacy` has no "Draft" banner. | after 1 |
| 3 | Mail for `influnet.io`: the domain has **no MX record**, so `support@influnet.io` and `grievance@influnet.io` (named in the privacy policy, and your Play contact) bounce. Cloudflare → Email → Email Routing → forward both to a real inbox. | ❌ you |
| 4 | Reviewer account (§3). Phone OTP is on for signup, so it must be created through the app with a phone that receives the SMS. | ❌ you |
| 5 | Upload `4621c358`'s `.aab` to a **Production** release (internal track first if you want a smoke test). | after build |

---

## 1. Data safety

**Does your app collect or share any of the required user data types?** Yes.
**Is all collected data encrypted in transit?** Yes (HTTPS/TLS everywhere).
**Do you provide a way for users to request that their data is deleted?** Yes —
in-app (Settings → Delete account) and on the web:
`https://staging.influnet.io/delete-account`
(`influnet.io/delete-account` is a 404 — use the staging URL.)

**Shared with third parties:** **None.** Every outside company we send data to
acts on our behalf as a service provider (Supabase — database/auth, Microsoft
Azure — hosting, Stream — chat, Resend — email, Razorpay — payments, Expo —
push delivery), which Google does not count as "sharing". We don't sell data
and the app has no ads or analytics SDKs (production build has no Sentry/PostHog
keys).

### Collected data types

For every row: **Collected = Yes · Shared = No · Processed ephemerally = No.**

| Category → type | Required or optional | Purposes |
|---|---|---|
| Personal info → **Name** | Required | App functionality, Account management |
| Personal info → **Email address** | Required | App functionality, Account management, Developer communications |
| Personal info → **Phone number** | Required (signup OTP) | Account management, Fraud prevention/security |
| Personal info → **User IDs** | Required | App functionality, Account management |
| Personal info → **Address** | Optional (businesses: registered address, GSTIN) | App functionality |
| Personal info → **Other info** (Instagram/YouTube handles + public follower counts, bio, niche) | Optional | App functionality |
| Location → **Approximate location** (the city a user types in — no GPS, no location permission) | Optional | App functionality |
| Financial info → **Purchase history** (project payment records and invoices; card/UPI details go to Razorpay, never to us) | Optional | App functionality |
| Messages → **Other in-app messages** (chat with brands/creators) | Optional | App functionality |
| Photos and videos → **Photos** (profile picture/logo, portfolio images) | Optional | App functionality |
| App activity → **App interactions** (profile views are recorded and shown to the creator viewed) | Optional | App functionality |
| App activity → **Other user-generated content** (campaign briefs, requests, reviews, portfolio entries) | Optional | App functionality |
| Device or other IDs → **Device or other IDs** (push-notification token) | Optional | App functionality |

Not collected: precise location, contacts, calendar, health, files/docs beyond
what a user attaches in a project, audio, web browsing, installed apps, crash
logs/diagnostics (none configured in production), advertising ID.

> If you later add `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_POSTHOG_KEY` to the
> EAS `production` environment, add **Crash logs**, **Diagnostics** and **App
> interactions → Analytics** here before the update ships.

---

## 2. Content rating (IARC questionnaire)

- **Category:** Social networking / communication (users message each other).
- Violence, sexual content, profanity, drugs, gambling, crude humour: **No**.
- **Users can interact / communicate with each other:** **Yes** (in-app chat).
  Report and block exist on profiles, campaigns, requests, projects and chat.
- **Shares user's current location with other users:** **No** (only a city the
  user typed, on their public profile).
- **Digital purchases:** **No** in this build (Pro purchase is hidden in store
  builds — `EXPO_PUBLIC_HIDE_PRO_PURCHASE=1`).

**Target audience and content:** 18 and over only (signup requires an 18+
confirmation). Not designed for children.

**Ads:** No, the app contains no ads.

---

## 3. App access

Choose **"All or some functionality is restricted"** and add one set of
credentials. Create it yourself, in the app, before submitting:

1. Sign up as a **creator** with an inbox you can read (e.g.
   `influnet+playreview@tecstellar.com`) and a phone that receives the SMS code.
2. Complete onboarding; link a public Instagram handle so Profile has numbers.
3. Optional but worth it: from a second (business) account, send this creator a
   request, so the reviewer sees Requests, a chat and a notification.

Instructions text for Play Console:

> Log in with the email and password below (no SMS code is needed to log in —
> the phone code is only asked at sign-up). The account is a creator. Requests,
> Messages and Projects are on the bottom bar; Profile is the avatar top-right;
> Notifications is the bell on Home.

---

## 4. Store listing basics

- **Privacy policy URL:** `https://influnet.io/privacy`
- **Developer contact email:** one that receives mail (see §0 step 3).
- **App category:** Business (or Social).
- Still needed from you: 512×512 icon (export `apps/mobile/assets/icon.png`),
  1024×500 feature graphic, at least 2 phone screenshots, short + full
  description.

---

## 5. Policy declarations worth a second look

- **Financial features:** the app takes payments between brands and creators
  for services, through Razorpay (an RBI-licensed payment aggregator) in a web
  checkout. Influnet doesn't hold funds or offer loans/banking. Answer the
  declaration as "payment processing via a third party" — your call, confirm
  with whoever owns the Razorpay account.
- **Account deletion:** in-app + web URL above; shared projects and invoices
  are kept for the other party and for tax law, which the delete page and the
  privacy policy both say.
