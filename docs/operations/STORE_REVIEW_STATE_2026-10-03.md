# Store review state — Android + iOS, as of 2026-10-03

Both apps are with the stores. This is the single place to pick up from when
either review comes back. Sources: EAS, App Store Connect and Play Console
screens seen on 2026-10-02/03, the repo, and the staging database.

## 1. Where each app is

| | Android | iOS |
|---|---|---|
| Package / bundle | `com.influnet.app` | `com.influnet.app` (ASC app id `6793490788`) |
| Binary | versionCode **8**, EAS production AAB (2 Oct, commit `26f8c9e6`) | **1.0.0 (9)**, EAS production (3 Oct, commit `fd3292b8`) |
| Stage | **In review**, sent on 2 Oct (dashboard said "In review"; Production tab shows *Inactive* because no Production release exists). Re-check the live status in Play Console → Publishing overview. | **Waiting for review**, submitted 3 Oct ~10:35 IST. Apple says up to 48 h; you get an email. |
| Release | Not yet on Production. Open testing track holds vc 8. | **Manual release**: approval does not publish; click Release This Version. |
| Countries | India | India only |
| Age | 18+ | 18+ (overridden from calculated 13+) |
| Backend | staging.influnet.io, Supabase `aokdansyqxracuwsosji` | same |

Heads-up from the last Play Console look: the tab landed on
`console/u/0/accept-terms`. If Google is waiting for you to accept updated
terms, accept them yourself; it can block the review from progressing.

## 2. What reviewers see

- **iOS login:** `influnet+review-creator@tecstellar.com`, password in
  `apps/web/.env.app-review` (gitignored). Entered in App Store Connect.
- **Brand (not given to Apple):** `influnet+review-brand@tecstellar.com`, approved.
- A pending brand → creator request exists. If a reviewer accepts or declines
  it, the Requests tab empties; send another from the brand account.
- **Android login:** whatever was typed into Play → App content → App access.
  Not verified. If it is `qa.creator@influnet.io`, switch it to the review
  creator. `qa.creator`'s username `qacreator` is the deploy smoke fixture and
  deleting it breaks every staging deploy.
- Reviewers may test **Delete account**. That is fine for the review accounts,
  not for `qa.creator`.

## 3. What can change under the reviewers' feet

Every push to `staging` that touches `apps/mobile/**` or `packages/**`
publishes a production OTA to **every installed build, including the two in
review** (all builds share runtime 1.0.0). Until both stores approve:

- Merge only docs-only PRs to staging. [PR #81](https://github.com/vimalsrinivasan1825-ui/Influnet/pull/81) is docs only.
- Hold back any mobile code change. If one is urgent, say so first.
- Latest production OTA: from staging merge `2c924764` (PR #80, 2 Oct): Sentry
  crash reports + PostHog analytics are already on in installed apps.

## 4. Open items before or alongside the reviews

| # | Item | Owner |
|---|---|---|
| 1 | **Play Data safety** must declare crash logs, diagnostics, analytics (rows in `PLAY_STORE_SUBMISSION_2026-10-02.md` §1). The OTA is already live, so do this now. | you |
| 2 | Play App access login → review creator account. | you |
| 3 | Log in once on a phone as the review creator; confirm Requests shows the request. | you |
| 4 | Merge PR #81 (docs). | you |
| 5 | Terms have no user → Influnet licence to display user content, yet Content Rights was answered "Yes, with rights". Add the clause with a lawyer. | you |
| 6 | `support@influnet.io` / `grievance@influnet.io` have no mailbox (no MX). The privacy policy names them. Cloudflare Email Routing. | you |
| 7 | Razorpay is still **test mode**. Reviewers never reach it, but it must go live before real brands pay (steps in `APP_STORE_SUBMISSION_2026-10-02.md` §5). | you |
| 8 | Same runtime `1.0.0` for every binary since July means an OTA can reach old native code. Changing the runtime policy needs an explicit OK (see the app-version rule). | decide |
| 9 | The iOS distribution certificate has been revoked twice in a month. Find out who else uses Apple team `S54MPG8G9M`. | you |

## 5. When the reviews come back

### Approved
- **iOS:** App Store Connect → the version → **Release This Version**. Then check
  the live listing and install it from the App Store.
- **Android:** open testing goes live once approved. For **Production**: Test and
  release → Production → Create release → pick the vc 8 bundle. A personal
  developer account may first need a closed test (12 testers, 14 days); the
  Production page says so if it applies.
- After release, install the store build and read Settings: it must say
  **"Influnet 1.0.0 (8)"** (Android) or **"(9)"** (iOS).

### Rejected or needs changes
- **iOS:** the reason is in App Store Connect → the version → **App Review**
  (Resolution Center) and in the email. Paste it to me. Likeliest causes:
  login did not work, empty-looking app, screenshots vs real app, privacy
  answers vs actual data use, the Content Rights answer.
- **Android:** Play Console → Policy status / Inbox. Likeliest causes: Data
  safety mismatch (item 1 above), login did not work, target audience.
- Fixes that are only metadata (text, screenshots, privacy answers, logins) need
  **no new build**. Code fixes need a new build, and a new versionCode / build
  number is assigned by EAS automatically.

### Commands
```bash
# latest builds per platform
cd apps/mobile && npx eas-cli build:list --platform ios --limit 3
cd apps/mobile && npx eas-cli build:list --platform android --limit 3
# upload a new iOS build (Apple login needed)
cd apps/mobile && npx eas-cli submit --platform ios --latest
```
