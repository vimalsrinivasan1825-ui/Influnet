# Email — architecture, setup and runbook

Canonical doc for everything Influnet sends by email. Supersedes the build plan in
[EMAIL_PROGRAM_PLAN_2026-07-31.md](EMAIL_PROGRAM_PLAN_2026-07-31.md), which is now history.

Built: 2026-08-02. Status: **code-complete, live once you finish §2 and flip `NOTIFY_EMAILS_ENABLED=true`.**

---

## 1. The two kinds of email, and who sends them

This distinction explains most of the setup, so it comes first.

| | App / transactional | Auth |
|---|---|---|
| **Examples** | welcome, collab request, project stage, payment receipt, unread messages | confirm signup, password reset, magic link, change email, reauthentication |
| **Sent by** | our code, `apps/web/src/lib/email/` → Resend API | **Supabase Auth**, from its own servers |
| **Design controlled in** | `src/lib/email/templates.ts` | Supabase Dashboard → Authentication → Emails → Templates |
| **How it reaches Resend** | direct API call | Supabase custom **SMTP** pointed at Resend |

Our app never sees an auth email. That's why `password_reset` exists in our template registry
purely as the *design source* — [scripts/build-auth-email-templates.ts](../../apps/web/scripts/build-auth-email-templates.ts)
renders it with Supabase's Go placeholders substituted in, and you paste the result into the
dashboard. Both kinds then look identical in the inbox.

---

## 2. Your checklist (human-only — I cannot do these)

1. **Resend account + verified domain.** Use a subdomain, e.g. `mail.influnet.io`. Add the SPF,
   DKIM and DMARC records Resend gives you at your DNS provider. Start DMARC at
   `v=DMARC1; p=none; rua=mailto:dmarc@influnet.io`, tighten to `quarantine` after a few clean weeks.
   > A subdomain means a bad marketing send damages `mail.influnet.io`'s reputation, not the root
   > domain's ability to send business mail.

2. **Two API keys** (Resend → API Keys, sending access, restricted to that domain): one for
   Supabase SMTP, one for the app, so either can be rotated alone. Put them straight into secrets —
   never into chat or git.

3. **Environment variables.** Every one is documented in
   [apps/web/.env.example](../../apps/web/.env.example) under "Email (Resend)". The minimum set:
   `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_APP_URL`, `NOTIFY_EMAILS_ENABLED`.
   > **Trap:** `NEXT_PUBLIC_APP_URL` freezes at build time (see the `env-var-inlining-traps` note).
   > Set it *before* the next Docker/Vercel build or every unsubscribe link points at the wrong host.
   > **Trap:** do not put an inline `# comment` after a value; not every loader strips it.

4. **Apply migration 098** (`supabase/migrations/098_email_delivery.sql`). Until it is applied there
   are no opt-outs, no daily cap, no dedupe and no delivery log — email still sends, but
   unprotected. The admin console says so in plain words when the tables are missing.

5. **Supabase → Authentication → Emails → SMTP Settings:** enable custom SMTP.
   Host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key, sender =
   your `EMAIL_FROM`, sender name `Influnet`.

6. **Supabase → Authentication → Emails → Templates:** run `npm run email:auth-templates` in
   `apps/web`, then paste each file from `supabase/email-templates/` into the matching template.
   The file's header comment names the template.

7. **Supabase → Authentication → URL Configuration:** Site URL = production URL; allow
   `https://<prod>/**`, the Vercel preview domain, and `influnet://**` so reset links open in the
   mobile app.

8. **Resend → Webhooks:** add `https://<prod>/api/webhooks/resend` for `email.bounced`,
   `email.complained` and `email.delivered`. Put the signing secret in `RESEND_WEBHOOK_SECRET`.
   **Skipping this is not cosmetic** — without it, bounced addresses are never suppressed, and
   repeatedly mailing dead addresses is the fastest way to get the domain blacklisted.

9. **Flip `NOTIFY_EMAILS_ENABLED=true`** — production first, and keep
   `EMAIL_ALLOWLIST=@influnet.io` set on staging permanently.

10. **Warm up.** First two weeks: account + activity mail only, no marketing. Volume ramp matters
    more than anything else for landing in the inbox.

---

## 3. How to test it

**Admin console — `/dashboard/admin/emails`** (admin role required).

- Every template in a sidebar, grouped by tier.
- Editable fields generated from each template's sample data; the preview re-renders as you type.
- Desktop/mobile width toggle.
- **Send a real test to any address you type** — your Gmail, a colleague, [mail-tester.com](https://www.mail-tester.com).
- Configuration strip at the top: whether sending is on, the from/reply-to, the allowlist, the daily
  cap, whether the bounce webhook is configured.
- The last 20 sends with their status and Resend id.

A test send deliberately **ignores** opt-outs, the daily cap and the dedupe ledger — the point of a
test is to see the mail. It still obeys `NOTIFY_EMAILS_ENABLED` and `EMAIL_ALLOWLIST`, because those
are environment rails, not recipient preferences. Rate-limited to 20/hour per admin.

**Offline preview, no server or login needed:**

```bash
cd apps/web && npm run email:preview
```

Writes every template to `apps/web/.email-preview/` with an index page. This is the right tool when
changing the shared shell in `layout.ts`, because you can see all 21 at once.

**What to check in the inbox that a preview cannot tell you:**
- It landed in **Inbox**, not Promotions or Spam
- Sender shows as **Influnet**, not a raw address
- Gmail shows no "via" warning next to the sender name (means SPF/DKIM alignment is wrong)
- The unsubscribe link appears next to the sender in Gmail (means `List-Unsubscribe` was accepted)

---

## 4. Architecture

```
apps/web/src/lib/email/
  theme.ts        brand tokens as literal hex (email supports no CSS vars, no oklch)
  layout.ts       the shell + block helpers every template is built from
  templates.ts    21 templates, each a pure function of its data
  client.ts       the only code that talks to Resend
  policy.ts       every "should we send this?" decision
  unsubscribe.ts  HMAC-signed opt-out links
```

**Templates are pure functions.** No database, no env beyond the base URL. That is what lets the
admin console render any of them with arbitrary data without sending anything, and what makes them
unit-testable.

**Layout constraints, and why:**
- Layout is `<table>`, not flex/grid — Outlook's Word rendering engine supports neither.
- Every colour and spacing value is an **inline style**. The `<style>` block carries only
  progressive enhancement (dark mode, small screens) that is safe to lose when Gmail strips it.
- Every interpolated value goes through `esc()`. A creator's display name is attacker-controlled
  text; unescaped, it can break the layout or smuggle markup into someone's inbox. There is a test
  for exactly this.
- `escUrl()` rejects any scheme that is not http/https, *before* making the URL absolute — otherwise
  `javascript:alert(1)` becomes `https://influnet.io/javascript:alert(1)` and passes an http check.
- Dark mode works by pairing an inline colour with a `dk-*` class the media query overrides. A block
  that forgets its class keeps light-mode colours on a dark card — invisible in a light-mode
  preview, unreadable in Apple Mail. A test asserts every emitted `dk-*` class has a matching rule.

### The three tiers

Everything we send belongs to exactly one. This is not bureaucracy — it is what decides whether the
mail carries an unsubscribe link and whether a user can switch it off.

| Tier | Examples | Opt-out | Unsubscribe link |
|---|---|---|---|
| **account** | password reset, confirm email, welcome, verification result | no | **no** |
| **activity** | collab request, stage moved, payment, unread messages | yes, per category | yes, required |
| **marketing** | product updates | opt-**in** only | yes, one-click |

Account mail carries no unsubscribe footer on purpose: a password reset with one reads as phishing,
and we could not honour it anyway. There is a test asserting the link never leaks into tier-A mail.

Marketing defaults **off**. Under India's DPDP Act 2023 a pre-ticked box is not consent.

### The send decision, in order

`deliverEmail()` in `policy.ts` is the only path product code should use. Order matters:

1. `NOTIFY_EMAILS_ENABLED` — master switch
2. Recipient resolved from **`auth.users`**, not `profiles.email` (the profile copy is written at
   signup and never re-synced, so it goes stale the moment someone changes their login address)
3. **Verified?** Unconfirmed addresses get account mail only — that *is* the confirmation path — so a
   typo'd address never receives someone else's project details. (`EMAIL_REQUIRE_VERIFIED`)
4. **Suppressed?** Bounced or complained → never again, no override, checked first among the
   preference checks
5. **Opted out?** per-category, from `email_preferences`
6. **Daily cap** — `EMAIL_DAILY_CAP` (default 6) activity mails/user/day; account mail is never capped
7. **Dedupe claim** — the ledger row is inserted *before* the Resend call, so two concurrent webhook
   redeliveries race on the unique `dedupe_key` and exactly one wins
8. Render, send, settle the ledger row with the Resend id

Every check **fails open** on a transient database error: a database blip must not silence a
password reset. Missing tables (migration 098 not applied) log a warning and continue.

### Rollups instead of one-mail-per-message

Message notifications use an hour bucket in the dedupe key:

```ts
dedupeKey: `message:${channelId}:${userId}:${hourBucket()}`
```

The second message in the same hour collides on the unique constraint and is dropped. "At most one
message email per conversation per hour" falls out of the dedupe mechanism — no separate scheduler.

### notifyUser() integration

[`notify.ts`](../../apps/web/src/lib/notify.ts) is the single fan-out point for ~21 call sites.
Email is a **third channel that each call site opts into**:

```ts
await notifyUser({
  userId, type: 'collab_request', title, body, link,
  email: {
    templateId: 'collab_request',
    data: { creatorName, businessName, projectName, budget, dashboardUrl: link },
    dedupeKey: `collab:${collabId}`,
  },
});
```

Omit `email` and nothing is sent — in-app row plus push only. That default is deliberate: turning on
all 21 sites at once, some of them per chat message, is how a sending domain gets blacklisted. Omit
`templateId` and it falls back to the `generic` layout built from the notification's own
title/body/link, which is fine for one-off events.

### Currently wired

| Where | Template |
|---|---|
| `POST /api/auth/register` | `welcome`, deduped `welcome:<userId>` so a retry can't double-send |
| Supabase Auth (SMTP + pasted templates) | confirm signup, reset password, magic link, change email, reauthentication |
| `/dashboard/admin/emails` | any template, on demand |

**Not yet wired**, ready to be — each is a `email: {...}` block at an existing `notifyUser()` call
site: collab request/accepted/declined, project stage, action-needed, completion, payment
received/failed, review received, unread messages, business approved/rejected. They render, they are
tested, and the policy layer will gate them correctly the moment a call site opts in. Left off
deliberately so volume can be ramped one flow at a time.

### Database (migration 098)

| Table | Purpose | Access |
|---|---|---|
| `email_preferences` | per-user, per-category opt-out. **Absent row = defaults** (activity on, marketing off), so no backfill is needed and a missing row can never silently mute someone | RLS, self-scoped |
| `email_suppressions` | hard blocks from bounce/complaint webhooks | service-role only (RLS on, no policies) |
| `email_deliveries` | one row per attempted send; powers dedupe, the cap, and "did they get it?" | service-role only |

---

## 5. Routes

| Route | Auth | What it does |
|---|---|---|
| `GET/POST /api/email/unsubscribe?t=<token>` | **none — the HMAC is the authority** | GET renders a confirmation page; POST is Gmail/Yahoo one-click |
| `POST /api/webhooks/resend` | Svix signature | bounce/complaint → suppression row; mirrors status onto the ledger |
| `GET/POST /api/admin/emails` | admin | list + config + recent; preview / test send |
| `GET/PATCH /api/profile/email-preferences` | user | the settings toggles |

**Why the unsubscribe link needs no login:** someone who wants out of our mail will not create a
session to do it — they will hit "report spam", and that costs the whole domain. So the token
carries the authority, which is why it is HMAC-signed: without a signature,
`?user=<uuid>&cat=message` would let anyone unsubscribe anyone. Tokens deliberately never expire; a
two-year-old email's link must still work.

The Svix verification is done by hand rather than pulling in the `svix` package for one function:
HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed by the base64 secret with `whsec_` stripped,
plus a five-minute timestamp window so a captured delivery cannot be replayed.

---

## 6. Runbook

**"Nothing is arriving."** Open `/dashboard/admin/emails` and read the configuration strip — it
answers this directly (sending off, no API key, allowlist blocking you). Then the delivery log:
a `skipped` row names the reason; no row at all means the policy rejected it before the ledger, and
the server log has the reason with an `[email]` prefix.

**"It arrives but lands in spam."** Almost always DNS. Send to
[mail-tester.com](https://www.mail-tester.com) from the admin console — it scores SPF, DKIM, DMARC
and content. A Gmail "via" warning next to the sender means SPF/DKIM alignment is wrong.

**"A user says they unsubscribed but still gets mail."** Check `email_preferences` for their
user_id. Account-tier mail is expected to continue and cannot be turned off.

**"We are sending too much."** Lower `EMAIL_DAILY_CAP`, or remove the `email:` block from the
noisiest `notifyUser()` call site. `EMAIL_ALLOWLIST` is the emergency brake — set it to a domain
nobody uses and sending effectively stops without a deploy.

**Rotating the Resend key:** update `RESEND_API_KEY` and the Supabase SMTP password separately —
that is why there are two keys.

**Changing `EMAIL_UNSUBSCRIBE_SECRET`** invalidates every unsubscribe link already sitting in
someone's inbox. Don't, unless it leaked.

---

## 7. Tests

`apps/web/tests/unit/email.test.ts` — 20 assertions:

- every template renders from its sample and produces a non-empty subject
- no template ever emits the string `undefined`
- account-tier mail has no unsubscribe link **even when one is passed in**
- every activity-tier mail has one
- an attacker-controlled display name is escaped inside a real template
- `javascript:` and `data:` URLs are rejected
- every `dk-*` class emitted has a matching dark-mode rule
- unsubscribe tokens round-trip; tampered payloads, forged signatures, a rotated secret and garbage
  input are all rejected
- `NOTIFY_EMAILS_ENABLED` is treated as false unless exactly `true`, including with a trailing
  inline comment

```bash
cd apps/web && npx vitest run tests/unit/email.test.ts
```
