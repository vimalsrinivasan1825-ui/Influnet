# Email program — current state & build plan (2026-07-31)

> **Superseded (2026-08-02).** The program described here has been built. See
> **[EMAIL_SYSTEM.md](EMAIL_SYSTEM.md)** for the canonical architecture, setup checklist and
> runbook. This file is kept for the reasoning behind the design — the tier model, the anti-spam
> rules and the DPDP considerations all carried over unchanged.

Scope: what exists today for email, what is missing, the consent/anti-spam design, and the
exact manual steps you (human) must do before any code can ship.

---

## 1. Where we actually stand

### 1.1 App / transactional email — 0% built

| Piece | State | Evidence |
| --- | --- | --- |
| Env vars declared | ✅ done | `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAILS_ENABLED` in [env.ts:54](../../apps/web/src/lib/env.ts:54) and [.env.example:94](../../apps/web/.env.example:94) |
| Env doctor reports email status | ✅ done | [env.ts:144](../../apps/web/src/lib/env.ts:144) |
| Any code that sends an email | ❌ none | no `lib/email*`, no `resend` dependency, nothing reads `RESEND_API_KEY` |
| Templates | ❌ none | — |
| Preferences / consent | ❌ none | no column, no table, no UI |
| Unsubscribe | ❌ none | — |
| Bounce / complaint handling | ❌ none | — |

So the env scaffolding is a placeholder someone wired in months ago. Functionally we are at zero.

### 1.2 Auth email — works only through Supabase's default sender

- Web signup calls `sb.auth.signUp` ([influencer/page.tsx:251](../../apps/web/src/app/signup/influencer/page.tsx:251), same in `business/page.tsx:114`); mobile does the same ([use-signup.ts:88](../../apps/mobile/lib/use-signup.ts:88)).
- Password reset uses `resetPasswordForEmail` ([reset-password/page.tsx:62](../../apps/web/src/app/reset-password/page.tsx:62), mobile `(auth)/forgot-password.tsx:40`).
- Both are sent by **Supabase's shared sender** unless custom SMTP is configured in the dashboard.
  That sender is rate-limited (a few per hour) and lands in spam often. Configuring Resend SMTP is
  a dashboard task, no code change — see §5 step 4.
- The code already handles both branches of the "Confirm email" project setting: if a session comes
  back it registers the profile immediately; if not it stashes the payload and shows
  "Check your email to confirm your account".

### 1.3 Two things the new phone-OTP work left open (both block email)

1. **`supabase/functions/auth-signup/index.ts` is not called by anything.** Neither web nor mobile
   invokes it; both still use `auth.signUp` directly. It creates users with `email_confirm: true`
   (line 73) — i.e. it marks the address verified **without ever sending a verification mail**.
   If we ever switch signup onto it, every address in the DB becomes "verified" while nobody has
   proven ownership. Mailing that list = bounces, spam complaints, and someone's project details
   landing in a stranger's inbox after a typo. Decide this before the email program goes live.
2. **Nothing records email ownership on our side.** `profiles.email` ([001_profiles_auth.sql:19](../../supabase/migrations/001_profiles_auth.sql:19)) is copied from auth metadata and has no
   `verified_at`. Any email sender we build has to consult *something* to know an address is safe
   to mail.

### 1.4 No consent surface anywhere

- No terms/privacy checkbox in either signup wizard (web influencer, web business, mobile).
- **No `/terms` or `/privacy` page exists** in `apps/web` or `apps/landing`; the landing footer has
  no legal links either.
- Settings ([dashboard/settings/page.tsx:389](../../apps/web/src/app/dashboard/settings/page.tsx:389)) shows email read-only. There is no notification
  preferences section at all — web or mobile.

This matters legally: India's **DPDP Act 2023** requires a clear notice + affirmative consent
before marketing/product-announcement email, and a way to withdraw it as easily as it was given.
Transactional mail about a collab the user is party to does not need that consent, but the
distinction only exists if we actually classify our mail.

### 1.5 What we *do* have that email should plug into

`notifyUser()` in [notify.ts:114](../../apps/web/src/lib/notify.ts:114) is already the single fan-out point: it writes a
`notifications` row, then best-effort Expo push. **21 call sites** across collabs, projects, deal
flow, stage entries, change requests, messages, the Razorpay webhook and the Stream webhook.

Adding email as a third channel there is one integration point — which is exactly why it is
dangerous: without classification, every one of those 21 sites starts emailing. Some of them fire
per message.

Reusable: [rate-limit.ts](../../apps/web/src/lib/rate-limit.ts) for send caps, `logger.ts`/Sentry for failures.

---

## 2. The policy — decide this before writing code

Three tiers. Everything we ever send must belong to exactly one.

| Tier | Examples | Consent | User can turn off? | Unsubscribe link |
| --- | --- | --- | --- | --- |
| **A. Account / security** | email verification, password reset, email-change confirm, login alert | none needed (necessary for the service) | no | no (but must be plainly from us) |
| **B. Activity** | collab request received, deal accepted, project stage needs your action, payment received/failed, someone messaged you | none needed — it's about a transaction they entered | **yes, per category** | yes |
| **C. Product / marketing** | new feature, tips, newsletter, re-engagement | **explicit opt-in, unchecked box** | yes | yes, one-click, mandatory |

### Anti-spam rules (this is the part that keeps us out of spam folders)

1. **Email is an escalation, not a duplicate.** Send tier-B mail only if the recipient has *not*
   seen the in-app notification within a delay window (suggest 15 min for action-needed, 60 min for
   messages). If they read it in the app, kill the email.
2. **Never one email per message.** Message notifications get rolled up: at most one "you have
   unread messages from X" per conversation per hour.
3. **Per-user daily cap** (suggest 5 tier-B mails/day, hard stop, overflow becomes a single digest).
4. **One send per event, ever** — dedupe key on `(user_id, notification_id)` so retries and the
   payment webhook's redeliveries can't double-send.
5. **Never mail an unverified or suppressed address.** Bounce/complaint from Resend → permanent
   suppression, no exceptions.
6. **Reply-To is a real inbox.** `noreply@` as From is fine; a black-hole Reply-To hurts both
   deliverability and trust.
7. **Off by default in dev/staging** via `NOTIFY_EMAILS_ENABLED=false`, plus an allowlist so
   staging can only mail our own domain.

### Defaults I recommend at signup

- Tier B categories: **ON** (they're the point of the product — a business is waiting on you).
- Tier C: **OFF**, with an unchecked "Send me product updates and tips" checkbox in the signup
  wizard, next to a "By creating an account you agree to the Terms and Privacy Policy" line.
- Never pre-tick the marketing box. Under DPDP a pre-ticked box is not consent.

---

## 3. What has to be built (code — my side, once you've done §5)

**Migration 095** (`email_consent_and_delivery`):
- `profiles.email_verified_at timestamptz`
- `profiles.marketing_opt_in boolean not null default false`, `marketing_opt_in_at`, `marketing_opt_in_source text`
- `email_preferences` — one row per user, boolean per tier-B category (`collab`, `project`,
  `payment`, `message`), default true; RLS self-scoped read/update
- `email_suppressions (email text primary key, reason, created_at)` — service-role only
- `email_deliveries (id, user_id, category, dedupe_key unique, resend_id, status, created_at)` —
  powers dedupe, the daily cap and debugging

**Code:**
- `lib/email/client.ts` — POST to `https://api.resend.com/emails`, hard-gated on
  `NOTIFY_EMAILS_ENABLED === 'true'` + key present; never throws (same contract as `notifyUser`)
- `lib/email/policy.ts` — NotificationType → tier/category map, verified check, suppression check,
  preference check, cap check, dedupe. **All send decisions live here, one place.**
- `lib/email/templates/` — plain HTML strings (no React Email dependency needed for ~8 templates),
  each with the unsubscribe footer + `List-Unsubscribe` / `List-Unsubscribe-Post` headers
- Deferred-send worker: a Supabase cron (or Vercel cron) that picks up "notification unread after N
  minutes" rows and mails them — this is what implements rule #1
- `app/api/email/unsubscribe/route.ts` — GET, HMAC-signed token in the URL (no login required),
  one click, confirms visually
- `app/api/webhooks/resend/route.ts` — svix-signed; `bounced`/`complained` → suppression row
- `app/api/email/verify/route.ts` + resend-verification action, if we go with our own email
  verification rather than Supabase's (see §5 step 5)
- Settings → "Notifications" section, **web and mobile**, toggling the categories + marketing
- Signup wizards (web ×2, mobile): terms/privacy consent line + unchecked marketing checkbox
- `/terms` and `/privacy` pages — I can build the pages; **the text has to come from you or a
  lawyer**, I will not invent legal terms

Rough size: migration + email lib + 8 templates + unsubscribe + webhook ≈ 1 focused session;
settings UI + signup consent on both platforms ≈ another; the deferred/digest worker ≈ another.

---

## 4. Suggested first mail set (8 templates)

| # | Trigger | Tier |
| --- | --- | --- |
| 1 | Verify your email (signup) | A |
| 2 | Password reset | A |
| 3 | New collab request received (creator) | B |
| 4 | Your request was accepted / declined (business) | B |
| 5 | A project stage needs your action | B |
| 6 | Payment received / payment failed | B |
| 7 | You have unread messages (hourly rollup) | B |
| 8 | Welcome + how Influnet works (once, at signup) | B (service intro, not marketing) |

Everything else waits until these are proven.

---

## 5. Your checklist — do these, then tell me and I start building

1. **Create the Resend account** at resend.com (free tier: 3,000/month, 100/day — enough to start).

2. **Add the sending domain.** Use a **subdomain**: `mail.influnet.com` (or `.in` — whichever is
   the real one). Reason: if a marketing send ever gets flagged, it damages the subdomain's
   reputation, not your root domain's ability to send business mail.
   Add the DNS records Resend gives you at your registrar:
   - SPF (TXT), DKIM (CNAME ×3 usually), and **DMARC** on the root: `_dmarc.influnet.com` TXT
     `v=DMARC1; p=none; rua=mailto:dmarc@influnet.com` — start at `p=none`, tighten to
     `quarantine` after a few weeks of clean reports.
   Verification is usually minutes; can take hours.

3. **Decide the addresses** and tell me the exact strings:
   - From (account/activity): `Influnet <noreply@mail.influnet.com>`
   - Reply-To: a **real monitored inbox**, e.g. `support@influnet.com`
   - From (product updates, later): `Influnet <updates@mail.influnet.com>`

4. **Create API keys** (Resend → API Keys, "Sending access", restricted to that domain). Make
   **two**: one for Supabase SMTP, one for the app — so either can be rotated alone.
   Put them into secrets yourself, never into chat or git:
   - Vercel (dev/preview) + Azure/Docker env (staging/prod): `RESEND_API_KEY`, `EMAIL_FROM`,
     `NOTIFY_EMAILS_ENABLED=false` for now, `NEXT_PUBLIC_APP_URL`
   - Local `apps/web/.env.local`: same, `NOTIFY_EMAILS_ENABLED=false`
   > Note the trap from `env-var-inlining-traps`: `NEXT_PUBLIC_*` freezes at build time. Set
   > `NEXT_PUBLIC_APP_URL` before the next Docker build or unsubscribe links will point at the
   > wrong host.

5. **Supabase dashboard → Authentication:**
   - **Emails → SMTP Settings**: enable custom SMTP — host `smtp.resend.com`, port `465`,
     user `resend`, password = the Resend API key, sender = your From, sender name `Influnet`.
   - **URL Configuration**: Site URL = production URL; Redirect URLs allow
     `https://<prod>/**`, the Vercel preview domain, and the mobile scheme (`influnet://**`) so
     reset links work in the app.
   - **Decide: keep "Confirm email" ON?** My recommendation: **yes, keep it on.** Phone OTP proves
     the phone; nothing proves the email, and the email is where every reset link and project
     notification goes. Keeping Supabase's confirmation is the cheapest correct answer and the
     signup code already handles it. If you'd rather not add a second gate at signup, the
     alternative is: let people in immediately, but mark the address unverified and send a
     verification mail — and email nothing but that until they click. Tell me which one.

6. **Legal text.** I need the actual content (or approval to draft a plain-language starting point
   for your lawyer to correct) for:
   - Terms of Service
   - Privacy Policy — must state what data we collect, that we email them about their collabs, and
     how to withdraw marketing consent
   Without these pages the signup consent line has nothing to link to.

7. **Later, after I've built the webhook route:** Resend → Webhooks → add
   `https://<prod>/api/webhooks/resend` for `email.bounced` and `email.complained`, and give me the
   signing secret name to read (`RESEND_WEBHOOK_SECRET`).

8. **Warm-up.** First 2 weeks: keep tier C off entirely, let only account + activity mail flow.
   Volume ramp matters more than anything else for landing in the inbox.

### Order of operations

Steps 1–4 unblock everything. Step 5 alone fixes signup-confirmation deliverability with **zero
code**. Step 6 is the long-pole if a lawyer is involved — start it now. Then I build §3, we ship
with `NOTIFY_EMAILS_ENABLED=false`, test against our own addresses, then flip it on.
