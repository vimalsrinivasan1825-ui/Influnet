# Influnet — 7-day sign-off plan

Written 2026-11-10 against `dev` at `77f30ab7`. Target: sign-off meeting on
**day 7 (17 Nov)**, with day 1 = 11 Nov.

This is the work order for the week. [HANDOVER.md](HANDOVER.md) stays the
canonical reference for *why* each go-live blocker exists and how to do it;
this file says **what to do, in what order, and how to tell it is done**.

Who does it: **Dev** = you, the developer. **Client** = needs the client's
account, money, signature or decision. **Both** = do it together on a call.

---

## 0. Progress

**Done by the developer on 2026-11-10** (on `dev`; not on staging until the
dev → staging PR merges):

| Item | What changed |
|---|---|
| P0.a | The app's privacy policy carries the Google Analytics wording again, identical to the landing site. Unit tests: 869 of 869 pass. |
| P1.c | `apps/web/.env.example` now lists every variable the code reads, with what happens when each is unset. The mobile example still lacks five optional ones (`EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_HIDE_PRO_PURCHASE`): add them with the next real mobile change, because any commit under `apps/mobile` publishes an over-the-air update. |
| P1.d | Deleted `docs/APPLY_PENDING_MIGRATIONS.sql`, `test_email_rpc.sql`, `fix-hrefs.js`, `apps/web/test-stream*.ts`, `supabase/cleanup.sql` and `railway.json`. `SUPABASE.md` moved to `docs/archive/`. |
| P1.g (part) | The weekly health sweep retries the dev probe, so a cold start no longer fails it. |
| P1.k | HANDOVER.md Part 0 re-verified and corrected; `handover-checklist.html` carries an out-of-date banner. |
| N7 | The landing site sends `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. Confirm with `curl -sI https://influnet.io` after the landing deploy. |
| N12 | The control characters in the chat-message regex are written as escapes; the file diffs as text again. |

**Deliberately not done, and why:**

| Item | Why it was left |
|---|---|
| P0.f event endpoints (N2) | **Not a one-line removal.** The landing header's "Join as Creator" button goes to `/join`, which posts to these endpoints, and the admin Event survey screen validates against the same list. Closing them breaks the public site's main creator button. Needs a product decision: what should "Join as Creator" do now that the event is over? |
| P1.j mobile refresh tokens (N5) | It changes how every phone stores its login, cannot be tested here without a device, and would reach store users by OTA. Do it with a two-phone test, not blind. |
| N9 `shadcn` to devDependencies | The audit's suggestion is wrong: `apps/web/src/app/globals.css` imports `shadcn/tailwind.css`, so it is a real build dependency. Leave it where it is. |
| P1.g nightly autofix, Dependabot PRs, old branches | Switching off a workflow, merging a 66-package bump and deleting branches are the owner's calls (D5). |
| P1.f local files | `ADMIN_CREDENTIALS.local.txt`, the backup dumps and the unfinished Play Store listing edits are yours; nothing local was deleted or committed. |

---

## 1. What "sign-off" has to mean

Two facts decide the shape of the week.

**Staging is the live product today.** The Android app released on Google Play
talks to `staging.influnet.io` and the staging database. There is no production
tier: no `main` branch, no production database, `deploy-prod.yml` has never run.
So "is it safe to hand over" is a question about staging, now.

**A production tier cannot be finished inside this week.** Building it
(HANDOVER P0.1 to P0.4) is 3 to 4 working days once the client's Supabase and
Azure accounts exist, and then the mobile app needs a new store build and a
store review (P0.9). Apple rejected the last iOS build on 20 Oct, so that
review time is not predictable.

Recommended scope, to agree with the client on day 1:

| In this sign-off (days 1 to 7) | Named follow-on, with a date and an owner |
|---|---|
| Live environment made safe (section 4, P0) | Production tier: HANDOVER P0.1 to P0.4 |
| Ownership of every account moved or scheduled (section 5) | New store builds pointed at production (P0.9) |
| Handover package complete (section 4, P1) | Items in the known-issues register (section 7) |
| Client has deployed one change themselves | |
| Known-issues register read and signed | |

If the client wants production inside the sign-off, the date moves. Say so on
day 1 rather than on day 6.

---

## 2. Checked today

| Thing | Result |
|---|---|
| `staging.influnet.io/api/health` | 200, healthy, database connected |
| `dev.influnet.io/api/health` | 200, but the first request timed out at 20 s (cold start, min replicas 0) |
| `dev` vs `origin/dev` | In sync |
| **`staging` vs `dev`** | **`dev` is 8 commits ahead.** Staging last deployed 23 Oct. See F1. |
| **CI on `dev`** | **Red since 10 Nov.** 868 of 869 unit tests pass; `legal-content.test.ts` fails. See F2. |
| Typecheck, lint, integration jobs in CI | Green |
| Local test run | Not possible: `node_modules` is not installed in this checkout. CI result used. |
| Deploy workflows | Last `deploy-dev` (5 Nov) and `deploy-staging` (23 Oct) succeeded |
| Scheduled workflows | Broadcasts, nudges, maintenance green. **Nightly autofix fails every night; weekly health failed 3 of the last 4 runs.** See F6. |
| Migrations in repo | 197 files, through `201_audit_enumeration_and_admin_scope.sql` |
| Legal pages | No `[[placeholder]]` left; `TERMS_VERSION` is `2026-09` |
| `influnet.io` MX records | **None.** `support@` and `grievance@influnet.io` still bounce. |
| Repo visibility | **Public.** See F3. |
| Open pull requests | 5, all Dependabot, all failing CI |
| `apps/mobile/eas.json` `production` profile | Still staging API and staging Supabase project |
| Open audit findings N2, N5, N11 ([SYSTEM_AUDIT](SYSTEM_AUDIT_2026-11-05.md)) | All three still open in the code |
| [ACCESS_INVENTORY.md](ACCESS_INVENTORY.md) | Still an empty template |

Not checked, because it needs a dashboard: Supabase Auth settings, container
env vars on Azure, Razorpay mode and webhooks, both store consoles, Sentry and
uptime alerts. The E2E harness was not run.

---

## 3. Found today

These are not in the earlier documents.

**F1. The live environment still runs the vulnerable Next.js.** `staging` has
`next 16.3.5`, the version with unauthenticated remote-code-execution
advisories. The fix (16.4.2), the zod fix and migration 201 have been on `dev`
since 5 Nov and were never merged to staging. This is the most urgent item in
the plan.

**F2. CI on `dev` is red, and the cause is a real mismatch.** Commit `9780316a`
added the Google Analytics disclosure to the landing site's privacy policy
(`apps/landing/src/lib/legal-data.ts`) but not to the app's copy
(`apps/web/src/app/legal/legal-content.ts`). The test that keeps the two
identical fails. The store listings link to one and the app opens the other.

**F3. The repository is public, and its history holds an admin credential.**
`vimalsrinivasan1825-ui/Influnet` is public. Commit `2d91fb65` (17 Sep, on
`origin/dev`) added a line to `.agents/lessons_learned.md` recording the
developer super-admin email and password in plain text. Anyone can read it.
Deleting the line today does not remove it from history, and making the repo
private does not recall copies already taken. The password must be rotated.
The docs in the repo also name both Supabase project refs, the review account
email and the Apple team id.

**F4. A second remote, far behind.** `upstream` is
`christopher-ship-it/Influnet`, last updated 12 July, 882 commits behind
`origin/dev`. If that is the client's repository, it holds none of the last
four months of work.

**F5. The legal pages name Tecstellar Solutions LLP as owner and operator.**
The App Store seller is the same. If the client is a different legal entity,
the Terms, Privacy Policy, store seller name and Razorpay merchant account all
have to change to the client's name, and that needs a lawyer and new store
paperwork. Settle this on day 1.

**F6. Two automations depend on the developer personally.** The nightly
autofix workflow runs on the developer's Claude or Anthropic credential and
reports to a Telegram chat; it has failed every night since at least 6 Nov at
the Claude step. The weekly health sweep fails on "Is the app up (dev)" because
dev cold-starts slower than the check waits.

**F7. `.env.example` is missing about 25 variables the code reads**, including
`CRON_SECRET`, `ADMIN_REQUIRE_MFA`, `BROADCAST_DRY_RUN`, the three
`CLOUDINARY_*`, `DELETION_HASH_SALT`, `PROFILE_REACH_SALT`,
`NEXT_PUBLIC_POSTHOG_KEY`, `PHONE_OTP_ENABLED` and `OWNERSHIP_GATE_ENABLED`. A
new developer following the example file gets a half-working app.

**F8. Staging holds real users' data. Check which Supabase plan it is on.** The
Free plan has no point-in-time recovery and pauses after 7 idle days. If
staging is on Free, the live product has no usable backup.

---

## 4. The week

### Day 1: decisions, and start everything that takes days

Nothing below can be compressed later, so it all starts on day 1.

| # | Who | Do | Done when |
|---|---|---|---|
| D1 | Client | **Who legally operates Influnet** (F5): Tecstellar or the client's company? | Written answer. Drives D2, the legal pages, the store accounts and Razorpay. |
| D2 | Client | **Scope of this sign-off**: section 1 table, or production included (date moves). | Written answer. |
| D3 | Client | **Where the code lives after handover** (F4): transfer the current repo, push to the client's repo, or a new organisation. And: private or public. | Destination named. |
| D4 | Client | **After sign-off**: maintenance retainer or none ([CLIENT_HOSTING_AND_MAINTENANCE.md](CLIENT_HOSTING_AND_MAINTENANCE.md)). Who answers when the site is down. | A name and a phone number. |
| D5 | Client | Small decisions: paid plans on or off at launch (P0.8); what the landing's "Join as Creator" button should do now the event is over (N2); keep or switch off the nightly autofix (F6). | Three yes/no answers. |
| L1 | Client | **Razorpay live mode**: start KYC now. It takes days. Merchant must be the entity from D1. | Application submitted. |
| L2 | Client | **Store account ownership**: if D1 is the client, start the Apple app transfer and the Google Play app transfer, or add the client as Account Holder / Owner. | Transfer started or access granted. |
| L3 | Client | **Mailboxes**: MX for `influnet.io` so `support@` and `grievance@` receive mail (Cloudflare Email Routing). The privacy policy and Apple both rely on them. | `dig MX influnet.io` returns records; a test mail arrives. |
| L4 | Client | **Lawyer**: the licence clause for user content (OWNER_TODO E), plus any change from D1. | Text received. |
| L5 | Client | **Create the accounts the client will own**: Supabase organisation, Azure subscription, a password manager vault shared with one other person. | Logins exist. |

### Days 1 to 2: P0, make the live environment safe

Sign-off should not happen with any of these open.

| # | Who | Do | Done when |
|---|---|---|---|
| P0.a ✅ | Dev | **Fix CI (F2)**: copy the Google Analytics wording into `apps/web/src/app/legal/legal-content.ts` so it matches the landing text. About 15 minutes. | `PR Checks (dev)` is green. |
| P0.b | Dev | **Merge `dev` into `staging` by pull request (F1).** Ships Next.js 16.4.2, zod, migration 201 and the two route changes together. Note: the merge touches `packages/core/package.json`, so `mobile-update.yml` will publish a production OTA to every installed app. Check the iOS review state first ([STORE_REVIEW_STATE](STORE_REVIEW_STATE_2026-10-03.md) section 3). | `deploy-staging` green; `/api/health` 200; `/dashboard/admin/health` shows 0 migrations pending; signup's email and phone availability checks still work. |
| P0.c | Dev | **Rotate the exposed super-admin password (F3)** on dev and on staging. Check the audit log for sign-ins by that account you do not recognise. | Old password refused on both. |
| P0.d | Both | **Make the repo private**, unless the client chose public in D3. Then run a secret scanner over the full history (`gitleaks detect`) and rotate anything it finds. | Repo private; scan report clean or every hit rotated. |
| P0.e | Both | **Admin two-factor** (OWNER_TODO B1): enable TOTP in Supabase on dev and staging, every admin enrols, then `ADMIN_REQUIRE_MFA=true` on both containers. | The "protected by a password only" banner is gone; an admin without MFA is refused. |
| P0.f | Both | **Event endpoints (N2).** Decide what the landing's "Join as Creator" button should do now the event is over (see section 0), then either repoint it to signup and close the endpoints, or keep them and put a phone OTP in front. | `POST /api/event-survey` no longer returns a registrant's details for a bare phone number. |
| P0.g | Client | **Renew `SUPABASE_ACCESS_TOKEN`** (OWNER_TODO A2). Revoke every older token in Supabase, Account, Access Tokens. | `scripts/apply-migration.mjs` and `tests/e2e/lib/sql.mjs` run. |
| P0.h | Client | **Staging database plan and backups (F8)**: confirm Pro, confirm daily backups exist. | Screenshot of the plan and the latest backup. |
| P0.i | Client | **Email confirmation on** for staging (HANDOVER P0.5). Fix the Auth Site URL and redirect list first, then turn Confirm email on, then point Auth at Resend SMTP. | A fresh signup receives a confirmation from the Influnet domain and cannot sign in before clicking it. |

### Days 3 to 4: P1, the handover package

| # | Who | Do | Done when |
|---|---|---|---|
| P1.a | Both | **Fill in [ACCESS_INVENTORY.md](ACCESS_INVENTORY.md)** using the service list in section 5. Values go in the password manager, never in the repo. | Every row has an owner and a vault entry. |
| P1.b | Both | **Move or share each account** per section 5. | Client can log in to each one without the developer. |
| P1.c ✅ | Dev | **Complete `apps/web/.env.example` (F7)** and the mobile one. One line per variable: what it does, what happens if it is unset. | `comm` of variables read by code against the example file shows only CI and runtime internals. |
| P1.d ✅ | Dev | **Remove dangerous leftovers (N11)**: `docs/APPLY_PENDING_MIGRATIONS.sql`, `test_email_rpc.sql`, `fix-hrefs.js`, `apps/web/test-stream*.ts`, `supabase/cleanup.sql`; archive `docs/operations/SUPABASE.md`; delete `railway.json` if Railway is no longer used. | Files gone from `dev`. |
| P1.e | Client | **The third Supabase project** `hrpaqufvjcihnjrjnpej` (from the Firebase era): does it still exist, and does it hold real user data? | Deleted, or secured and listed in the inventory. |
| P1.f | Dev | **Clean the working folder** before sharing it in any form: `ADMIN_CREDENTIALS.local.txt`, the four `*-backup-*.json` dumps, `firebase-debug.log` (all untracked, all still on disk). Commit or discard the unfinished Play Store listing changes. | `git status` clean; none of those files on disk. |
| P1.g | Dev | **CI the client can trust**: switch off or re-credential the nightly autofix (F6); give the weekly health check a longer wait or a warm-up request; merge or close the 5 Dependabot PRs; delete merged remote branches (25 exist). | No workflow fails for a reason unrelated to the product. |
| P1.h | Client | **Cron secrets and rate limits** (OWNER_TODO B3, B4): `CRON_SECRET` on the container, the three endpoint secrets in GitHub, Upstash on staging. | `/dashboard/admin/rate-limits` reports Upstash; a scheduled nudge run does work rather than skipping. |
| P1.i | Client | **Alerts to one place the client owns** (OWNER_TODO C): uptime check on `/api/health`, Sentry issue alert, Supabase usage alert, GitHub workflow-failure mail. | A deliberately failed check reaches the client's inbox or channel. |
| P1.j | Dev | **Mobile refresh-token storage (N5)**: move each account's refresh token to SecureStore. JS only, so it ships as an OTA. Needs your go-ahead while iOS is in review. | Token no longer in AsyncStorage on a fresh login; account switching still works. |
| P1.k ✅ | Dev | **Refresh the handover docs**: HANDOVER.md Part 0, and either regenerate or retire `handover-checklist.html` (dated 12 Aug, now wrong in several rows). | No doc given to the client contradicts section 2 of this file. |
| P1.l | Client | **Play Console**: Data safety declaration and App access login (OWNER_TODO E). **iOS**: status of the reply to the 20 Oct rejection ([RESUBMISSION_4.3](app-store/RESUBMISSION_4.3_2026-10-20.md)). | Both consoles show no open policy item, or the open item is written into section 7. |

### Days 5 to 6: P2, prove it and rehearse

| # | Who | Do | Done when |
|---|---|---|---|
| P2.a | Dev | **Full regression**: unit tests; the E2E harness against dev (`seed-personas.mjs` first, `NOTIFY_EMAILS_ENABLED` off during, restored after). | Counts written into the sign-off record. |
| P2.b | Both | **Two-phone manual pass** of the released Android app using the test-run checklist (`/r/<token>/test-run`). | Checklist session saved; failures triaged into "fix now" or section 7. |
| P2.c | Both | **One real payment** on staging once the Razorpay account and its webhook are in place: the gate must open by itself. If live keys are not ready, record it as pending. | Capture in Razorpay matches an opened gate, or the item is in section 7. |
| P2.d | Client | **Restore drill** (HANDOVER P0.12): restore a staging backup into a scratch project and open the app against it. | Time taken is written down. |
| P2.e | Both | **Client does one deploy**: a one-line change, `dev` then PR to `staging`, watched but not driven by the developer. | The change is live on staging and the client did the clicks. |
| P2.f | Both | **Walkthrough, recorded**: admin console, Team and roles, broadcasts with `BROADCAST_DRY_RUN`, the break-glass switches (HANDOVER Part 2), where the logs are. | Recording stored with the client. |
| P2.g | Both | **Rotate credentials, last** (order in ACCESS_INVENTORY): service-role keys, Stream secret, Razorpay secret and webhook secret together, Resend, Apify, Supabase access token, GitHub tokens, Azure service principal, `EXPO_TOKEN`. Deploy and check `/dashboard/admin/health` after each. | Developer's old values are refused. |

### Day 7: sign-off meeting

Walk through section 6 line by line, then sign section 7.

---

## 5. Every account, and what handing it over means

| Service | What it holds | Handing over means |
|---|---|---|
| GitHub | Repo, 3 Environments, all CI secrets | Transfer or re-host per D3. Secrets are write-only: every value must be in the vault before any move. Current collaborators: `vimalsri318`, `Kamalesh9394`. |
| Supabase | dev `jaajosocopoicmqcffuu`, staging `aokdansyqxracuwsosji` | Transfer both projects to the client's organisation. |
| Azure | Container Apps (dev, staging), registry, `influnet-rg`, Static Web App for the landing site, Application Insights | Client is Owner on the subscription, or resources move to theirs. |
| Domain and DNS | `influnet.io` and subdomains | Registrar and DNS logins with the client. Note the renewal date. |
| Razorpay | Payments | Merchant account in the D1 entity's name. One webhook per environment. |
| Stream | Chat (separate apps for dev and staging) | Account owner changed or client added as admin. |
| Resend | All product and auth email | The account that owns the verified domain. A key from another account silently fails. |
| 2Factor | SMS OTP (prepaid credits) | Login, plus who tops it up. |
| Cloudinary | Image uploads | Login. |
| Apify, HikerAPI | Social verification | Login. Apify Free blocks the X actor. |
| Upstash | Rate limiting | Create under the client (not yet set on staging). |
| Sentry, PostHog | Errors, analytics | Client added as owner. |
| Expo / EAS | Mobile builds and OTA updates, `EXPO_TOKEN` | Project moved to the client's Expo account, or client added as owner. |
| Apple Developer | Team `S54MPG8G9M`, app `com.influnet.app` | Per D1 and L2. Find out who keeps revoking the distribution certificate. |
| Google Play | `com.influnet.app` | Per D1 and L2. |
| Google Analytics, Meta Pixel | Landing site | Client added as admin. |
| UptimeRobot | Uptime alerts | Create under the client. |
| Anthropic / Claude token, Telegram bot | Nightly autofix only | Remove, or replace with the client's (D5). |

---

## 6. Sign-off acceptance checklist

- [ ] `staging` runs the same code as `dev`; CI green; `/dashboard/admin/health` shows 0 pending migrations and every required integration configured
- [ ] No known critical or high security finding open on the live environment
- [ ] Exposed admin password rotated; repo visibility as decided; history scanned
- [ ] Admin MFA enforced; every admin has their own login
- [ ] Email confirmation on; support and grievance mailboxes receive mail
- [ ] Backups confirmed and one restore done, with the time recorded
- [ ] Access inventory complete; client can log in to every service alone
- [ ] Credentials rotated after the developer's last change
- [ ] Client has deployed one change and seen the admin console walkthrough
- [ ] Unit and E2E counts recorded; two-phone pass done
- [ ] Alerts reach the client
- [ ] Written answers to D1 to D5
- [ ] Known-issues register (section 7) read and signed by the client
- [ ] Follow-on work (production tier, store builds) has an owner and a date

---

## 7. Known-issues register

Handed over open, on purpose. Each is in [SYSTEM_AUDIT_2026-11-05.md](SYSTEM_AUDIT_2026-11-05.md)
or [HANDOVER.md](HANDOVER.md) with the detail.

| Issue | Risk if left | Suggested timing |
|---|---|---|
| No production tier; store apps and real users are on staging | A staging deploy or test run touches real data | First follow-on project |
| Mobile `production` profile points at staging | Same as above | With the production tier |
| No forced-update path for mobile | An urgent fix cannot be made to reach every phone | Next native build |
| Stage machine enforced in the API only, not in SQL | Non-payment gates can be skipped by a direct database call. Payment gates are safe. | First month |
| Stream chat tokens never expire | A leaked token reads that user's chats permanently | First month |
| Cloudinary uploads have no format or size cap | Abuse, storage cost | First month |
| CSP is report-only | Weaker protection against injected scripts | First month |
| Phone OTP token not single-use; phone numbers not unique | Limited account-linking abuse | First month |
| Staff field masking is API-only (N6) | Staff can read hidden fields by calling the database directly | First month |
| Scheduled jobs run on GitHub cron | Late or skipped runs, no retry | First month |
| No data-retention jobs beyond OTP logs | DPDP Act exposure | Decide retention periods, then build |
| Refunds and disputes only in the Razorpay dashboard | No audit trail in the console | When volume justifies it |
| No native crash reporting on mobile | Crashes seen only in store consoles | Next native build |
| 43 dependency advisories outside the request path | Low today | A dedicated PR, with a mobile build test |
| GitHub Actions pinned to tags, not commits | Supply-chain exposure in CI | First month |
| Apify Free plan | X verification does not work | When X matters |
| iOS: rejected 20 Oct (4.3 / 4.2.6); certificate revoked twice | iOS not live | Client follows up in App Store Connect |
| All binaries share runtime `1.0.0` | An OTA can reach old native code | Decide at the next native build |
