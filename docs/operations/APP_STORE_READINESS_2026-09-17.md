# App Store & Google Play readiness — Influnet mobile

Date: 2026-09-17 · App: `apps/mobile` (Expo SDK 57, RN 0.86, `com.influnet.app`)
Backend for store builds: `staging.influnet.io` + Supabase `aokdansyqxracuwsosji`
(staging is production — see [GO_LIVE_AUDIT_2026-09-17.md](GO_LIVE_AUDIT_2026-09-17.md))

Everything about **our app** below was checked in the code or with
`expo config --type introspect` on the `production` profile — not recalled.
Store rules were checked against Apple's and Google's current published policy
(sources at the end). Research only: no code was changed for this report.

---

## Status re-checked 2026-09-21 (read this first)

Every row below was re-checked against `dev` today — code, `expo config --type
introspect` on the `production` profile, `eas build:list`, `eas env:list
production`, and a read-only query of the staging database. The original
report (§0 onward) is kept as the reasoning.

**Code-side, the app is now submittable. What stops a submission today is
yours: the staging backend is behind, iOS signing is broken, the legal text
is unfinished, and there are no reviewer accounts.**

| # | Item | 17 Sep | 21 Sep | Evidence / what's left |
|---|---|---|---|---|
| 2.1 | Pro sold via Razorpay in app | ❌ | ✅ | `EXPO_PUBLIC_HIDE_PRO_PURCHASE=1` on the production profile hides every buy path. **Fixed today:** the "Upgrade to Pro" video guide (price, "Tap Upgrade") still played in store builds, including auto-running on `/billing` — now hidden (`lib/guide-visibility.ts`). |
| 2.2 | Account deletion | ❌ | ✅ | In-app delete in Settings → `DELETE /api/profile` (tombstone first, refuses mid-project, keeps ledger/invoices — `verify-161` passes live). Public page `/delete-account` exists for Google's web-deletion URL (people who can't sign in email support@influnet.io). **Fixed 2026-09-22:** that page said projects and their files are deleted; `verify-161` proves shared projects and documents survive for the other party — wording corrected. Use the page's wording for the Data safety form. |
| 2.3 | Consent + legal links | ❌ | ⚠️ **you** | Terms + 18+ checkboxes on both mobile wizards, enforced server-side (422 without). Legal links in Settings. **Still blocking:** the pages the app opens (`/legal/*`, `apps/web/src/app/legal/legal-content.ts`) show **24 `[[placeholders]]`** — `[[LEGAL ENTITY NAME]]`, grievance officer, address, GSTIN — under a DRAFT banner, and `TERMS_VERSION` is `2026-09-draft-1`. A reviewer who taps "Privacy Policy" sees that. Separately, the landing site's `influnet.io/privacy` is a **different, complete-looking** text. Pick one binding text with a lawyer, fill it, and make the app and the store listing point at the same URL. |
| 2.4 | Report / block / filter | ❌ | ✅ code / ⚠️ you | Report/block on creator + business profiles, campaigns, requests, projects. **Fixed today:** chat had none on **either** platform (the mobile code comment claimed it did) — added to the mobile chat ⋮ menu and the web conversation menu. Content filter shipped on every write path the API owns (`verify-content-filter` 18/18) — **but not on chat messages**, which go straight to Stream. ⚠️ **you:** turn on Stream's moderation (blocklist or AI moderation) in the Stream dashboard for the production app. Also yours: commit to a response time in the terms and actually watch `/dashboard/admin/reports`. |
| 2.5 | Reviewer accounts | ❌ | ❌ **you** | Staging DB has **0** review accounts (12 users total). Create `appreview.brand@…` (pre-approved) and `appreview.creator@…` with a shared mid-stage project, once staging is current. |
| 2.6 | iOS privacy manifest | ❌ | ✅ | `ios.privacyManifests` with the four required-reason APIs, `NSPrivacyTracking: false`. |
| 2.7 | Unused permissions | ❌ | ✅ | Introspected: Android = INTERNET, VIBRATE, legacy storage ≤ API 32; `RECORD_AUDIO` + `SYSTEM_ALERT_WINDOW` removed; no `READ_MEDIA_*`. iOS = camera + photos strings only; Face ID + mic off. |
| 2.8 | iOS signing | ❌ | ❌ **you** | Last iOS `production` build (1 Sep) **ERRORED** at code signing; no iOS build since. Run `eas credentials` (Apple login) → regenerate the distribution certificate, enable Push on `com.influnet.app`, upload an APNs key. Android `production` AAB built fine (1 Sep, versionCode 3). |
| 2.9 | Toolchain | verify | verify | Confirm Xcode 26 image and target API 36 on the first new build. |
| 2.10 | Age | ⚠️ | ✅ code / ⚠️ you | 18+ confirmation at signup. You: answer the age-rating questionnaires (18+) and launch in the India storefront only. |
| 2.11 | Creator payouts | ⚠️ | ⚠️ **decide** | Unchanged — a product/legal decision. |
| 2.12 | Developer accounts | setup | ❓ **you** | Unknown from the repo. Check organization vs personal on both consoles. |
| 3.1 | Icon | ⚠️ | ✅ | **Fixed today:** `assets/icon.png` regenerated at 1024×1024, opaque, same artwork and proportions. |
| 3.4 | Push prompt timing | ⚠️ | ✅ | Pre-prompt after a meaningful moment (`lib/push-prompt.ts`). |
| 3.5 | Crash visibility | ⚠️ | ❌ **you** | EAS `production` environment holds only the four API/Supabase/Stream vars — **no `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_POSTHOG_KEY`**. Add them (`eas env:create`) before the store build or review-time crashes are invisible. |
| — | **Backend the store build talks to** | — | ❌ **you** | The production profile points at `staging.influnet.io`. Staging's DB is at migration **147**; dev is at **172**, and staging's code is ~150 commits behind. Merge dev → staging (blueprint t14) **before** building for the stores. |

**Order for you:** merge dev → staging → regenerate iOS credentials → add
Sentry/PostHog keys to EAS `production` → legal text final → review accounts
on staging → `eas build --profile production` (both platforms) → TestFlight /
internal track → submit with the §5 review notes.

---

## 0. Verdict

**Neither store would approve the current build.** Six issues are near-certain
rejections, and three of them hit **both** stores. None is exotic, and most are
a few days of work each. The two that need a decision before code are the
**Pro subscription** (§2.1) and **who owns the developer accounts** (§2.12).

| # | Issue | iOS | Android | Effort | Who |
|---|---|:-:|:-:|---|---|
| 2.1 | Pro plan is bought with Razorpay inside the app | ❌ reject | ❌ reject | Decision + 1–2 wks for real IAP, or 1 day to hide | Decide, then code |
| 2.2 | "Delete account" is an email to a domain that has no mailbox | ❌ reject | ❌ reject | 2–3 days | Code |
| 2.3 | No terms/privacy acceptance at signup, no legal links in the app, legal pages unpublished | ❌ reject | ❌ reject | 1 day code + your legal text | Both |
| 2.4 | Report/block missing on profiles, campaigns, requests; no content filter | ❌ likely | ⚠️ likely | 2–3 days | Code |
| 2.5 | Reviewers can't get in: need demo accounts on the production DB | ❌ reject | ⚠️ | ½ day | You + code |
| 2.6 | No iOS privacy manifest | ❌ upload warning → reject | — | 1 hour | Code |
| 2.7 | Unused microphone + Face ID permissions with vague wording | ❌ likely | ⚠️ | 1 hour | Code |
| 2.8 | iOS distribution certificate revoked; push capability not on App ID | ❌ can't build | — | 1 hour | You |
| 2.9 | Toolchain minimums (iOS 26 SDK, Android API 36) | verify | verify | first build | Code |
| 2.10 | Age: terms say 18+, app never asks; new Apple social-media questions | ⚠️ | ⚠️ | 1 day | Both |
| 2.11 | Creator payouts don't exist, but terms promise them | ⚠️ reviewer Q | ⚠️ | product work | Decide |
| 2.12 | Developer account type (organization vs personal) | setup | 12 testers × 14 days if personal | weeks of lead time | You |

What is **already right** and needs no work is in §4 — there is more of it
than the table suggests.

---

## 1. What we have today (inventory)

| Area | State | Evidence |
|---|---|---|
| Auth | Email + password only; phone OTP at signup (2Factor, India-only). **No social login** → Sign in with Apple **not required** (Apple 4.8). | no `signInWithOAuth` anywhere |
| Screens | 46 native screens (tabs: home, campaigns, requests, messages, projects). One embedded WebView: the creator public profile. | `apps/mobile/app/**`, `components/profile-web-view.tsx` |
| Payments — projects | Brand pays creator for deliverables via web Razorpay checkout in an in-app browser. | `app/projects/[id]/stage/[stage].tsx:171` |
| Payments — Pro plan | Pro subscription via web Razorpay checkout in an in-app browser. | `lib/use-upgrade.ts` → `/checkout/pro` |
| Account deletion | Opens `mailto:support@influnet.in`. | `app/settings.tsx:316` |
| Report / block | Project screen (report + block), conversation screen, blocked-accounts screen. | `app/projects/[id]/index.tsx:317,330`, `app/blocked-accounts.tsx` |
| Legal links in app | **None.** | grep for terms/privacy in `apps/mobile` |
| Permissions (introspected, production) | Camera, Photos (good strings) · **Microphone, Face ID (generic strings, unused)** · Android: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, legacy storage (≤ API 32) | `expo config --type introspect` |
| iOS privacy manifest | **Not configured** (`ios.privacyManifests` absent) | same |
| Universal / app links | None (`associatedDomains`, `intentFilters` unset) | same |
| Push | expo-notifications; `aps-environment` handled per profile in `app.config.js`; FCM via `google-services.json` | `app.config.js` |
| Analytics / crash | PostHog + Sentry over plain `fetch`, inert unless `EXPO_PUBLIC_*` keys set — **production profile sets neither** | `lib/analytics.ts`, `eas.json` |
| Icon | `icon.png` **512×512 with alpha** | `assets/icon.png` |
| OTA | expo-updates, `runtimeVersion: appVersion`, channel `production` | `app.json` |
| Store guard | Production build refuses a non-production backend (`eas-build-pre-install`) | `scripts/check-mobile-production-target.mjs` |

---

## 2. Blockers, one by one

### 2.1 The Pro subscription (both stores) — decide first

**What the app does.** "Upgrade to Pro" mints a Razorpay order and opens
`staging.influnet.io/checkout/pro` in an in-app browser (`lib/use-upgrade.ts`).
Upsell prompts also appear at limits (e.g. `app/profile-viewers.tsx`,
`app/portfolio/add.tsx`).

**The rule.**
- **Apple 3.1.1:** unlocking features or subscriptions inside the app must use
  In-App Purchase. In every storefront except the US, apps may not include
  buttons, links or calls to action that lead to another way to pay.
- **Google Payments policy:** paying for in-app features or subscriptions must
  use Google Play Billing. In **India**, developers can enrol in **user choice
  billing** and offer their own billing *alongside* Play Billing, for a 4%
  lower fee. Play Billing is still required, and Billing Library 8+ applies.

**Options, in order of speed:**

| Option | What it takes | Risk |
|---|---|---|
| **A. Launch mobile without selling Pro** (recommended first) | Build-time flag: in store builds, hide every upgrade button, price, "Pro" upsell and link to `/checkout/pro`. Pro bought on the web still applies — entitlements already come from `/api/billing/entitlements`. At a limit, say "limit reached" with no purchase path. | Apple sometimes questions apps whose features are unlocked by an outside purchase (3.1.3(b) asks for IAP parity). For a B2B tool with nothing to buy in the app, this is usually accepted. Low–medium. |
| **B. Real in-app purchase** | App Store Connect subscriptions + Play subscriptions, a native purchase module (e.g. RevenueCat or `react-native-iap` → **new native build**, not OTA), and server receipt validation that sets the same tier as the Razorpay webhook. Google: optionally enrol in India user choice billing to keep Razorpay as a second option. | Correct long term. 1–2 weeks. Apple takes 15% on the Small Business Program (30% otherwise); Google 15% on subscriptions. |

**Recommendation:** ship A now, build B once there's evidence people buy Pro
on mobile. Decide the pricing difference before B — store fees usually mean a
higher in-app price.

**Project payments are a different case and can stay on Razorpay.** A brand
paying a creator for content that's made and posted *outside* the app is a
real-world service. Apple 3.1.3(e) covers goods and services consumed outside
the app, and Google exempts peer-to-peer payments and real-world services.
Freelance marketplaces are approved on this basis. Explain it in the review
notes (§5) so a reviewer doesn't lump it in with Pro.

### 2.2 Account deletion (both stores)

**What the app does.** Settings → Delete account opens an email to
`support@influnet.in`. **`influnet.in` has no MX record**, so that mail
bounces (`influnet.io` does receive mail).

**The rule.**
- **Apple 5.1.1(v):** any app with account creation must let users start
  deletion inside the app. An email link isn't enough.
- **Google:** needs an in-app path **and** a public web page where someone can
  request deletion without opening the app. That URL goes in the Data safety
  form.

**What exists to build on.** The web app already has `DELETE /api/profile`
(self-delete), but it isn't safe to wire up as it stands:
- It will **fail (500)** for any user who issued a project document:
  `project_documents.issued_by` has no cascade. The admin delete route clears
  it first; this one doesn't.
- It doesn't remove the user from **Stream** (chat history stays on Stream's
  servers) or sweep orphaned conversations, which the admin route does.
- It hard-deletes records the draft terms promise to keep: invoices and
  payment records for tax purposes, "commonly eight years".
- It doesn't handle open projects or held payments, doesn't re-confirm the
  password, and doesn't write an audit entry.

**Fix.**
1. Harden `DELETE /api/profile` like the admin route.
   - Anonymise rather than destroy anything with legal retention (invoices, payments).
   - Refuse, or require cancelling first, while a project is mid-payment.
   - Delete the Stream user, re-check the password, and write an audit entry.
2. In-app flow: Settings → Delete account → explain what is deleted and what is kept → confirm with password → sign out.
3. Public page, e.g. `/legal/delete-account`: a signed-in delete, plus a request form for people who can't sign in.
4. Replace `support@influnet.in` everywhere with an address on a domain that receives mail.

### 2.3 Terms, privacy policy and consent (both stores)

**What the app does.**
- Neither the web nor the mobile signup asks users to accept terms.
- The mobile app has no link to terms or privacy anywhere.
- The legal pages 404 on staging (not deployed) and still contain `[[…]]`
  placeholders, so they render as drafts.

**The rule.**
- **Apple 5.1.1(i):** a privacy policy link in App Store Connect **and** inside the app.
- **Apple 1.2 and Google UGC policy:** users must accept terms before they can post content.
- **Both stores** require a privacy policy URL that works.

**Fix.**
1. A required "I agree to the Terms and Privacy Policy" checkbox with links in both signup wizards, with the acceptance time recorded server-side.
2. A **Legal** section in Settings: Terms, Privacy, Refunds, Contact, Delete account.
3. Merge dev → staging so `/legal/*` is live.
4. **You:** fill in the identity placeholders (legal entity, registered address, GSTIN, grievance officer) and remove the draft markers after legal review. The App Store also shows the seller name from your Apple account, so it has to match the legal entity.

The privacy policy must also list every third party that receives user data
(§3.6 has the list from the code).

### 2.4 User-generated content safety (Apple 1.2, Google UGC)

**What the app has.**
- Profiles, portfolio items, campaign posts, request messages, and one-to-one
  chat (Stream).
- Report + block on the project screen and in conversations, a blocked-accounts
  list, and an admin Reports screen on web.

**What's missing.**
- **Report/block on creator profiles, business profiles, campaign detail and
  request detail.** Apple asks for reporting "for offensive content" and
  blocking of abusive users wherever users meet that content.
- **Any objectionable-content filter.** Apple 1.2 asks for "a method for
  filtering objectionable material". Nothing in the codebase filters text.
  Stream's moderation (blocklists / AI moderation) is the cheapest route for
  chat; a server-side word list on bios, campaign text and request messages
  covers the rest.
- **A stated response time.** The terms should commit to acting on reports
  (typically within 24 hours), and someone has to actually watch
  `/dashboard/admin/reports`.
- **Published contact information** in the app (Settings → Contact).

**Fix.** Add a shared "Report / Block" action sheet to those four screens,
reusing `endpoints.createReport` / `createBlock`. Turn on Stream moderation.
Add the terms clause.

### 2.5 Review access (Apple 2.1; Google app access)

Reviewers have to reach every feature without help. Today:
- Signup requires an Indian mobile OTP (the `phone_otp` flag is on for staging).
  Reviewers are outside India and won't get the code.
- A new business account starts **pending approval** and can't send requests.
- Projects need two parties. A reviewer alone can't see the stage machine.

**Fix (mostly you):**
1. Create two review accounts on the **production database**, with an obvious
   label such as `appreview.creator@influnet.io` and
   `appreview.brand@influnet.io`:
   - the brand account pre-approved;
   - one active project between them, partway through the stages;
   - a completed project;
   - a conversation.
2. Put both logins in App Store Connect "Sign-In Information" and Play Console
   "App access". Login doesn't ask for an OTP, so no bypass is needed.
3. Keep these accounts out of analytics and admin counts, and never purge them.
   Treat them like the `qacreator` fixture.
4. Tell reviewers not to pay (production Razorpay is live) and give a short
   click-path to the payment stage instead.

### 2.6 iOS privacy manifest

**What the app does.** `ios.privacyManifests` isn't set. React Native and Expo
modules use "required reason" APIs such as UserDefaults and file timestamps.
Apple can't reliably read manifests bundled inside static CocoaPods
dependencies, so the app's own manifest has to declare them. Without it,
uploads get ITMS-91053 warnings, which become rejections.

**Fix.** Add `expo.ios.privacyManifests` in `app.json`:
- `NSPrivacyAccessedAPITypes` with UserDefaults `CA92.1`, FileTimestamp
  `C617.1`, SystemBootTime `35F9.1`, DiskSpace `E174.1`.
- `NSPrivacyTracking: false`.
- `NSPrivacyCollectedDataTypes` matching §3.6.

Then introspect to confirm, and read the warnings email from the first
TestFlight upload. Follow Expo's privacy-manifest guide.

### 2.7 Unused permissions with generic wording

**What the build contains** (introspected, production):

| Permission | Where it comes from | Used? | Wording |
|---|---|---|---|
| iOS Microphone / Android `RECORD_AUDIO` | expo-image-picker default | **No** (photos only) | "Allow $(PRODUCT_NAME) to access your microphone" |
| iOS Face ID | expo-secure-store default | **No** | "Allow $(PRODUCT_NAME) to access your Face ID biometric data" |
| Android `SYSTEM_ALERT_WINDOW` | React Native dev tooling | No | — |

Apple rejects vague purpose strings (5.1.1), and both stores question
permissions an app never uses.

**Fix.**
- `expo-image-picker` plugin: `"microphonePermission": false`.
- `expo-secure-store` plugin: `"faceIDPermission": false`.
- `android.blockedPermissions`: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`.

Photos are already fine for Google's photo and video policy: the app doesn't
request `READ_MEDIA_IMAGES`, and expo-image-picker uses the system photo picker.

### 2.8 iOS signing and push (you)

- The distribution certificate was **revoked** as of 2026-09-01, and both iOS
  EAS builds failed code signing then. Not re-checked for this report —
  confirm with `eas credentials`. Regenerate it with `eas credentials` (needs your
  Apple login).
- Enable **Push Notifications** on the `com.influnet.app` App ID
  (`app.config.js` explains why it was dropped from an earlier build).
  Upload an APNs key to EAS.
- Create the App Store Connect record with bundle ID `com.influnet.app`, and
  claim the name "Influnet" early.

### 2.9 Toolchain minimums

- **Apple:** since 2026-04-28 uploads must be built with Xcode 26 / the iOS 26 SDK. Pin the EAS iOS image to one that ships Xcode 26 and confirm on the first build.
  - The iOS 26 SDK applies **Liquid Glass** styling to native controls (tab bar, sheets). Check `(tabs)/_layout.tsx` and the bottom sheets on a real device before submitting. `expo-glass-effect` is already installed.
- **Google:** since 2026-08-31 new apps and updates must target **API 36** (Android 16); extensions run to 2026-11-01. Expo SDK 57 should set this — confirm the target API Play Console shows after the first upload. If Pro uses Play Billing (§2.1 B), Billing Library 8+ is required.

### 2.10 Age

- The terms say "at least 18" and "not for anyone under 18", but signup never asks.
- **Apple** replaced 12+/17+ with 13+/16+/18+. From **September 2026** the rating questionnaire asks about social-media features, and apps with them (user profiles, discovery, messaging) get at least 13+. You can then choose a higher rating: pick **18+** to match the terms.
- 18+ apps can't be downloaded in **Australia, Brazil and Singapore** without adult verification, and Texas/Utah/Louisiana have their own age-assurance rules. Being India-first, **launch in the India storefront only** (both stores let you choose countries) until age checks are deliberate.
- **Fix:** an "I am 18 or older" confirmation at signup (next to the terms checkbox), stored server-side. Answer the questionnaires honestly: user-generated content yes, messaging yes, social features yes, unrestricted web access no.
- India's DPDP Act needs verifiable parental consent for under-18s. Being 18+-only avoids building that, provided signup enforces it.

### 2.11 Creator payouts don't exist

Brands pay into Influnet's Razorpay account, but nothing in the code pays
creators (no Razorpay Route / transfers). The draft terms promise payout
"within 5–7 business days". A reviewer testing the flow may ask where the
money goes, and holding funds for third parties has RBI implications (payment
aggregator rules), so it needs a decision regardless of the stores: Razorpay
Route with linked creator accounts, or manual payouts disclosed honestly in
the terms. Google's **Financial features declaration** should describe the
marketplace payments accurately. Collecting payments for services is not a
banking feature, so the answer is normally minimal.

### 2.12 Developer accounts (you, start now — longest lead time)

- **Google Play:** a *personal* account created after 2023-11-13 must run a
  **closed test with 12+ testers opted in for 14 continuous days** before
  production access. An **organization** account is exempt, needs a D-U-N-S
  number, and shows the company as publisher — the right choice for an app
  that takes payments. Which type exists today isn't recorded in
  `ACCESS_INVENTORY.md`; check Play Console → Settings → Developer account.
- **Apple:** an organization enrolment (D-U-N-S) shows the legal entity as
  seller and is expected for a marketplace handling payments. D-U-N-S
  issuance and Apple verification can each take one to two weeks.
- Note both in `ACCESS_INVENTORY.md`: owner email, renewal date.

---

## 3. Not blockers, but they decide how smooth review is

1. **Store icon.** `icon.png` is 512×512 with transparency. Provide
   1024×1024 with no alpha for iOS, a 512×512 Play icon, and separate Android
   adaptive layers (they already exist). An upscaled 512 looks soft on the
   store page.
2. **WebView profile (Apple 4.2).** One embedded web page inside a mostly
   native app is fine. Keep it that way: don't add more WebView screens
   before review.
3. **Instagram/YouTube data (Apple 5.2.2).** Follower counts come from Apify
   scraping of public profiles, and YouTube from its public feed. Apple can
   ask whether you're authorised to display third-party platform content.
   Ownership is verified with the creator's own profile link in their bio,
   which helps. Say in the review notes that creators connect their own accounts,
   and keep the displayed data to the creator's own public metrics.
4. **Push prompt timing.** Today the system prompt fires the moment a session
   exists (`app/_layout.tsx:57` → `lib/push.ts:59`), before the user has seen
   why. Allowed, but a pre-prompt after a meaningful moment (first request
   sent or received) gets more opt-ins and reads better in review.
5. **Crash visibility at launch.** The production profile sets no
   `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_POSTHOG_KEY`, so review-time and
   launch-week crashes are invisible. The JS-level reporter exists; set the
   keys for the store build.
6. **Deep links.** Without universal/app links, password-reset emails and
   shared profile links open the website rather than the app. Nice to have:
   `associatedDomains` + `apple-app-site-association`, Android
   `intentFilters` + `assetlinks.json` on `staging.influnet.io`.
7. **Export compliance.** `ITSAppUsesNonExemptEncryption: false` is already
   set and correct (HTTPS only). No further documents needed.
8. **Data declarations** — Apple App Privacy and Google Data safety. From the
   code, declare:

   | Data | Purpose | Shared with |
   |---|---|---|
   | Name, email, phone | Account, OTP, notifications | Supabase (hosting), 2Factor (OTP), Resend (email) |
   | City / location text, bio, niches, social handles, follower counts | Profile and discovery | Supabase; Apify / YouTube (lookups) |
   | Photos | Avatar, cover, portfolio | Cloudinary |
   | Messages | Chat | Stream |
   | Purchase history, payment info | Project payments, Pro plan | Razorpay (card data never touches us) |
   | GST number, business details | Invoices, business verification | Supabase |
   | User ID, push token | Push notifications | Expo, APNs, FCM |
   | Usage data, crash data (if keys set) | Analytics, diagnostics | PostHog, Sentry |

   Not used for tracking or ads. Data is encrypted in transit. Deletion is
   available (after §2.2). The privacy policy text must match this table.

---

## 4. Already in good shape

- Email/password auth, so no Sign in with Apple obligation.
- The app is overwhelmingly native: 46 screens, one WebView.
- Project payments go through a real-world-services path that both stores allow.
- Camera and photo purpose strings are specific.
- Photo access already goes through the system picker (Google's photo policy).
- Export compliance key is set.
- Push entitlement is handled per build profile.
- Separate dev/preview bundle IDs, so test installs never collide with the store app.
- Store builds refuse a wrong backend (`eas-build-pre-install`).
- Blocking, a blocked-accounts screen, reporting on projects and chat, and an admin reports queue.
- A signup flow that already copes with email confirmation.
- OTA updates, which Apple allows when they don't change the app's purpose.

---

## 5. App Review notes (draft for App Store Connect / Play Console)

> Influnet is a marketplace where brands hire content creators. Brands and
> creators agree on deliverables in chat, then run the collaboration through
> a 12-stage project checklist signed off by both parties.
>
> **Payments.** When a brand pays a creator for a project, it pays for a
> real-world service — the creator produces and publishes content on their
> own social channels, outside this app — so these payments use Razorpay,
> not In-App Purchase (Guideline 3.1.3(e)). The app sells no digital content
> or subscriptions.
>
> **Demo accounts.** Brand: appreview.brand@… / Creator: appreview.creator@…
> Both are pre-approved and share an active project (Projects tab → "…") and a
> conversation. Please don't complete a payment — payments are live. The
> payment step is at Projects → "…" → Advance payment.
>
> **Account connections.** Creators verify that they own an Instagram account
> by adding their Influnet profile link to their own bio; we show only their
> public metrics.
>
> **Safety.** Users can report or block anyone from their profile, a
> conversation, a request, a campaign or a project. Reports are reviewed
> within 24 hours at support@… .

(Replace "sells no subscriptions" with the IAP description if you choose §2.1 B.)

---

## 6. Suggested order

| Week | Code (developer) | You |
|---|---|---|
| **Now** | — | Check/convert Play and Apple accounts to **organization** (D-U-N-S) · regenerate iOS certificate · enable Push on App ID · reserve the app name · fix the support mailbox |
| **1** | §2.1 A (hide Pro purchase in store builds) · §2.2 safe delete + web page · §2.3 consent checkbox + legal links · §2.6 privacy manifest · §2.7 permissions · §2.10 18+ confirmation | Fill legal placeholders + lawyer review · decide payouts (§2.11) · merge dev→staging |
| **2** | §2.4 report/block everywhere + Stream moderation · store build + TestFlight + Play internal track · Liquid Glass device check | Create review accounts + seed data (§2.5) · screenshots (iPhone 6.9", Play phone) + feature graphic + descriptions · App Privacy + Data safety forms (§3.8) · age questionnaires |
| **3** | Fix anything TestFlight / pre-launch report flags | If Play account is personal: closed test with 12 testers (14 days — start in week 2) · submit to App Review (India storefront) |

A new native build is needed for §2.6, §2.7 and any IAP work. OTA updates
can't change permissions or the manifest. Remember to bump `LAST_COMMIT_TIME`
in settings and the Expo SDK patch version in that build.

---

## Sources

- Apple App Review Guidelines — https://developer.apple.com/app-store/review/guidelines/
- Apple: Updated age ratings — https://developer.apple.com/news/?id=ks775ehf · social media questions — https://developer.apple.com/news/?id=tlur8uvi · age requirements (Brazil, Australia, Singapore, Utah, Louisiana) — https://developer.apple.com/news/?id=f5zj08ey · age assurance Q&A — https://developer.apple.com/support/age-assurance
- Apple SDK minimum requirements — https://developer.apple.com/news/upcoming-requirements/ · Expo on the iOS 26 SDK minimum — https://expo.dev/blog/app-store-connect-minimum-sdk-26
- Expo privacy manifests — https://docs.expo.dev/guides/apple-privacy/
- Google Play target API level — https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play testing requirement for new personal accounts — https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play Payments policy — https://support.google.com/googleplay/android-developer/answer/9858738 · India billing changes — https://support.google.com/googleplay/android-developer/answer/13306652 · user choice billing — https://support.google.com/googleplay/android-developer/answer/13821247
- Google Play account deletion — https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play photo and video permissions — https://support.google.com/googleplay/android-developer/answer/14115180
- Google Play user-generated content — https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play financial features declaration — https://support.google.com/googleplay/android-developer/answer/13849271
