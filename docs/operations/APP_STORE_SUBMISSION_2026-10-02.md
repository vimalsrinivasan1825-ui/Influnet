# App Store submission — Influnet iOS 1.0.0

Date: 2026-10-02 · Bundle ID `com.influnet.app` · EAS project `edd0c6bd…`
(production profile → `staging.influnet.io` + Supabase `aokdansyqxracuwsosji`,
the same backend as the Android build under review)

The iOS twin of [PLAY_STORE_SUBMISSION_2026-10-02.md](PLAY_STORE_SUBMISSION_2026-10-02.md).
Most answers are the same data seen through Apple's form, so where Play's answer
carries over this says so instead of repeating it. Background on each guideline
is in [APP_STORE_READINESS_2026-09-17.md](APP_STORE_READINESS_2026-09-17.md).

---

## 0. Where iOS stands (checked 2026-10-02)

| Item | State |
|---|---|
| Distribution certificate | ❌ **Revoked again.** Build 7 (22 Sep) signed fine; build 8 (`bfb1a428`, 2 Oct) failed: Apple rejects cert `6DD002CE…`. Second revocation in a month, so find out who else uses team `S54MPG8G9M` and how they manage certificates. Fix: §1, run the build command **interactively** and log in with your Apple ID; when it says the certificate is invalid, let it create a new one. |
| Push on the App ID + APNs key | ✅ Production push proven on iOS on 22 Sep. |
| Privacy manifest, export compliance, permission strings | ✅ In `app.json` (`ITSAppUsesNonExemptEncryption: false`). |
| Sign in with Apple | ✅ Not required — email/password only, no Google/Facebook login. |
| Legal pages | ✅ No placeholders left; `TERMS_VERSION` `2026-09`. |
| Pro purchase hidden (3.1.1) | ✅ `EXPO_PUBLIC_HIDE_PRO_PURCHASE=1` in the profile and in the production OTA job. |
| **A build of today's code** | ❌ Build 7 predates the redesign, glass tab bar and new font. Needs a fresh production build (§1). |
| **App Store Connect record** | ❓ you — create it if it doesn't exist (§2). |
| Crash reporting + analytics | ✅ Sentry + PostHog keys in the production profile and the production OTA job (2026-10-02), same projects as the website. Declared in §3. |
| `support@influnet.io` mail | ⚠️ same as Play §0.3 — the domain has no MX record. Use `influnet@tecstellar.com` as the support contact until it's fixed. |

---

## 1. Build and upload

Optionally merge `dev` → `staging` first, so the production OTA channel and the
binary carry the same code. Today the only gap is the build-number line in
Settings.

```bash
cd apps/mobile && npx eas-cli build --platform ios --profile production
```

The build number auto-increments from EAS's remote counter (version stays
`1.0.0`). Do **not** set `ios.buildNumber` in app.json — `appVersionSource` is
`remote`, so it would be ignored.

```bash
cd apps/mobile && npx eas-cli submit --platform ios --latest
```

`submit` asks for your Apple ID (or an App Store Connect API key) and uploads to
App Store Connect. Processing takes 10–30 min. The build then shows in
TestFlight. Install it there on one iPhone first, and check Settings reads
**"Influnet 1.0.0 (N)"**. That proves you're running the new binary, not an old
one that updated itself.

---

## 2. App Store Connect → App Information

| Field | Value |
|---|---|
| Name | Influnet |
| Subtitle (30) | Brand deals for creators |
| Bundle ID | com.influnet.app |
| SKU | influnet-ios-1 (any unique string, never shown) |
| Primary category | Business · Secondary: Social Networking |
| Content rights | Does not contain third-party content it lacks rights to (creators show their own public metrics) |
| Privacy Policy URL | `https://influnet.io/privacy` |
| Support URL | `https://influnet.io` (needs a visible contact email on the page) |
| Price | Free · Availability: **India only** |
| Age rating | Answer "None" for every content category; **Yes** to user-to-user messaging and user-generated content; no unrestricted web access; result → choose **18+** (signup requires an 18+ confirmation). |

**Description, promotional text, keywords:** reuse `play-store/LISTING.md`
(full description fits Apple's 4000 limit as is). Keywords (100, comma-separated,
no spaces): `creator,influencer,brand,collab,marketing,instagram,youtube,campaign,deals,ugc`

**Screenshots:** iPhone 6.9" (1320 × 2868) is the only required size;
`supportsTablet` is false, so no iPad set. 3–10 images. The Play screenshots in
`play-store/` are the wrong aspect ratio. Take them from the TestFlight build.

---

## 3. App Privacy (the "nutrition label")

**Do you or your third-party partners collect data?** Yes.
**Used for tracking?** No, for every type. No ads, no ad ID, no data brokers.
Every type below is **linked to the user's identity**.

| Apple type | Purpose(s) |
|---|---|
| Contact Info → Name | App Functionality |
| Contact Info → Email Address | App Functionality |
| Contact Info → Phone Number | App Functionality |
| Contact Info → Physical Address (businesses: registered address) | App Functionality |
| Location → Coarse Location (the city a user types; no GPS permission) | App Functionality |
| User Content → Photos or Videos | App Functionality |
| User Content → Emails or Text Messages (in-app chat) | App Functionality |
| User Content → Other User Content (bio, briefs, reviews, portfolio) | App Functionality |
| Identifiers → User ID | App Functionality |
| Purchases → Purchase History (project payments, invoices) | App Functionality |
| Usage Data → Product Interaction (profile views; screens and funnel steps to PostHog) | App Functionality, Analytics |
| Diagnostics → Crash Data (JS errors to Sentry) | App Functionality |
| Diagnostics → Other Diagnostic Data (app version, OS on an error) | App Functionality |

Not collected: precise location, contacts, health, financial info (card/UPI go
to Razorpay), browsing history, search history, device ID. PostHog and Sentry
are first-party analytics we run for ourselves. Nothing is combined with other
companies' data or used for ads, so none of it counts as **tracking**, and the
app needs no App Tracking Transparency prompt.

---

## 4. App Review Information

**Sign-in required:** Yes. Use the **same creator account as Google Play**
(`influnet+playcreator@tecstellar.com`, the password you noted). Logging in is
email and password only, so the reviewer needs no Indian phone number.
**Contact:** your name, phone, `influnet@tecstellar.com`.

**Notes** (paste):

> Influnet is a marketplace where brands hire content creators. This demo
> account is a creator. A brand has already sent it a collaboration request
> (Requests tab). Messages and Projects are on the bottom bar, Profile is the
> avatar top-right, and Notifications is the bell on Home. No SMS code is needed
> to log in; the phone code is only asked at sign-up.
>
> Payments: brands pay creators for a real-world service — the creator produces
> and publishes content on their own social channels, outside this app — so
> these payments go through Razorpay on our website, not In-App Purchase
> (Guideline 3.1.3(e)). Creators never pay, and the app sells no digital
> content or subscriptions.
>
> Creators prove they own an Instagram account by adding their Influnet profile
> link to their own bio; we show only their public metrics. Users can report or
> block anyone from a profile, conversation, request, campaign or project.

**Version release:** "Manually release this version", so you choose the day.

---

## 5. Razorpay in test mode — not a review problem, but a launch one

**For review: no effect.** The iOS and Android apps contain no checkout at all.
A business taps **"Pay on web"**, which opens the project on
staging.influnet.io, and the reviewer logs in as a creator, who never pays. The
Pro purchase is hidden in store builds. A reviewer never reaches a Razorpay
screen, so test mode is invisible to them. Don't mention it in the notes.

**For real users it matters, before the first real brand pays.** In test mode
no money moves, but the signed webhook is genuine. A brand who pays with
Razorpay's published test card would open the advance/final payment gate, and
the creator would see "paid". Switching to live means:

1. Razorpay dashboard → live mode activated (KYC done).
2. Replace the repo secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `NEXT_PUBLIC_RAZORPAY_KEY_ID` with the `rzp_live_` pair.
3. Create a live-mode webhook pointing at staging's `/api/payments/webhook`
   URL, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
4. Redeploy staging. `NEXT_PUBLIC_*` is frozen at build time, so a redeploy
   is required, not just an env edit.

No app build is needed for any of this; the apps never hold a Razorpay key.
