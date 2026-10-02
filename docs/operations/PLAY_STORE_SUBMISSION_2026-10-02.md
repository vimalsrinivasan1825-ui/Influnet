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
| 1 | Merge PR #78 (`dev` → `staging`) — published legal text live on staging.influnet.io. | ✅ done 2026-10-02 |
| 2 | Staging deploy + production OTA green; `/legal/privacy` has no draft markers. | ✅ done |
| 3 | Mail for `influnet.io`: the domain has **no MX record**, so `support@influnet.io` and `grievance@influnet.io` (named in the privacy policy, and your Play contact) bounce. Cloudflare → Email → Email Routing → forward both to a real inbox. | ❌ you |
| 4 | Reviewer accounts (§3) — SMS step off for ten minutes, two test numbers, back on. | ❌ you |
| 5 | Upload `4621c358`'s `.aab` (finished) to a **Production** release. | ❌ you |

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
push delivery, Sentry — crash reports, PostHog — product analytics), which
Google does not count as "sharing". We don't sell data and the app has no ads.

> **Changed 2026-10-02 — update the live form.** Sentry crash reporting and
> PostHog analytics were switched on for production (`eas.json` + the production
> OTA job). The form you sent with build 8 said "no crash logs / diagnostics".
> Edit Data safety in Play Console to match the table below **before merging
> `dev` → `staging`**, because that merge is what delivers the keys to installed phones.

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
| App activity → **App interactions** (profile views shown to the creator viewed; screens and funnel steps sent to PostHog) | Required | App functionality, Analytics |
| App activity → **Other user-generated content** (campaign briefs, requests, reviews, portfolio entries) | Optional | App functionality |
| Device or other IDs → **Device or other IDs** (push-notification token) | Optional | App functionality |
| App info and performance → **Crash logs** (JS errors sent to Sentry) | Required | Analytics |
| App info and performance → **Diagnostics** (error context: app version, OS) | Required | Analytics |

Not collected: precise location, contacts, calendar, health, files/docs beyond
what a user attaches in a project, audio, web browsing, installed apps,
advertising ID. Analytics events are sent only after sign-in, under the user's
own id. No anonymous device identifier is created.

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

## 3. App access — reviewer accounts with ONE phone number

Signup needs an SMS code, and the signup form refuses a number that's already
registered (`check_phone_available`, migration 107) — so a second account on
your own number won't work. Don't insert users with SQL either: that skips
`/api/auth/register`, which writes the profile rows. Instead, switch the SMS
step off for ten minutes. The app reads it at runtime (`/api/auth/config`), so
no build is involved.

**Run in the Supabase SQL editor of the STAGING project (`aokdansyqxracuwsosji`):**

```sql
-- 1. SMS code OFF (takes ~1 minute: the flag is cached 45s per server)
insert into public.feature_flags (key, enabled, description)
values ('phone_otp', false, 'off: creating Play review accounts')
on conflict (key) do update set enabled = excluded.enabled, description = excluded.description;
```

Then, in the **production app** (or staging.influnet.io):

| Account | Email (plus-addressing lands in your own inbox) | Phone (no SMS is sent) |
|---|---|---|
| Creator — the one Google logs in with | `influnet+playcreator@tecstellar.com` | `9000000001` |
| Brand — only to give the creator real content | `influnet+playbrand@tecstellar.com` | `9000000002` |

Use a strong password each and note them. Give the creator a bio, a niche,
a city and a public Instagram handle so Profile isn't empty.

```sql
-- 2. SMS code back ON — straight after both accounts exist
insert into public.feature_flags (key, enabled, description)
values ('phone_otp', true, 're-enabled')
on conflict (key) do update set enabled = excluded.enabled, description = excluded.description;
```

Then:
3. Admin console → **Approvals** → approve the review brand.
4. Log in as the brand (web is fine): open the creator's profile (they get a
   "viewed your profile" notification) and **send a collaboration request**.
5. Log out. Only the **creator** login goes into Play Console.

Play Console → App content → App access → "All or some functionality is
restricted" → add the creator's email + password, with:

> Log in with the email and password below (no SMS code is needed to log in —
> the phone code is only asked at sign-up). This is a creator account. Requests,
> Messages and Projects are on the bottom bar; Profile is the avatar top-right;
> Notifications is the bell on Home. A brand has already sent a request.

If `ownership_gate` is on, accepting that request asks the creator to verify
Instagram first — fine for review; the request itself is visible either way.

---

## 4. Store listing

Everything except screenshots is ready in [`play-store/`](play-store/):
[`LISTING.md`](play-store/LISTING.md) (name, short + full description, release
notes, which screenshots to take), `icon-512.png`, `feature-graphic-1024x500.png`.

- **Privacy policy URL:** `https://influnet.io/privacy`
- **Developer contact email:** `influnet@tecstellar.com` works today;
  `support@influnet.io` only once §0 step 3 (MX) is done.
- **App category:** Business. **Countries:** India.

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
